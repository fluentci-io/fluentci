use super::{
    App,
    error::{Failure, Result, backend_error},
    key::Key,
};
use crate::config::Backend;
use axum::{
    body::Body,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
};
use futures_util::{StreamExt, stream};
use object_store::{GetOptions, GetRange};
use std::{sync::atomic::Ordering, time::Duration};
use tokio::sync::OwnedSemaphorePermit;

fn text_header(headers: &HeaderMap, name: header::HeaderName) -> Result<Option<String>> {
    headers
        .get(name)
        .map(|v| {
            v.to_str()
                .map(str::to_owned)
                .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid header\n"))
        })
        .transpose()
}

fn parse_range(value: &str) -> Result<GetRange> {
    let bad = || {
        Failure(
            StatusCode::RANGE_NOT_SATISFIABLE,
            "invalid or multiple byte ranges\n",
        )
    };
    let (start, end) = value
        .strip_prefix("bytes=")
        .and_then(|v| v.split_once('-'))
        .ok_or_else(bad)?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| bad())?;
        if suffix == 0 {
            return Err(bad());
        }
        return Ok(GetRange::Suffix(suffix));
    }
    let start = start.parse::<u64>().map_err(|_| bad())?;
    if end.is_empty() {
        return Ok(GetRange::Offset(start));
    }
    let end = end
        .parse::<u64>()
        .ok()
        .and_then(|v| v.checked_add(1))
        .filter(|end| *end > start)
        .ok_or_else(bad)?;
    Ok(GetRange::Bounded(start..end))
}

pub(super) fn redirects(app: &App) -> bool {
    app.config.public_read && matches!(app.config.backend, Backend::S3)
}

// Check committed metadata before redirecting so cached CDN misses cannot hide new uploads.
pub(super) async fn cdn_redirect(app: &App, key: &Key) -> Result<Response> {
    let mut url = reqwest::Url::parse(app.config.cdn_url.as_deref().expect("validated S3 CDN URL"))
        .expect("validated S3 CDN URL");
    {
        let mut segments = url.path_segments_mut().expect("validated HTTP CDN URL");
        segments.pop_if_empty();
        segments.extend(app.config.prefix.split('/').filter(|part| !part.is_empty()));
        segments.extend(key.path.as_ref().split('/'));
    }
    let meta = match app.catalog.lookup(&key.path) {
        Some(meta) => meta,
        None => tokio::time::timeout(Duration::from_secs(10), app.store.head(&key.path))
            .await
            .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "cache lookup timed out\n"))?
            .map_err(backend_error)?,
    };
    let version = meta
        .e_tag
        .unwrap_or_else(|| meta.last_modified.to_rfc3339());
    url.query_pairs_mut().append_pair("v", &version);
    let mut response = Redirect::temporary(url.as_str()).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    Ok(response)
}

pub(super) async fn download(
    app: &App,
    key: Key,
    headers: &HeaderMap,
    head: bool,
    permit: Option<OwnedSemaphorePermit>,
) -> Result<Response> {
    if redirects(app) {
        return cdn_redirect(app, &key).await;
    }
    let range = if head {
        None
    } else {
        text_header(headers, header::RANGE)?
            .map(|v| parse_range(&v))
            .transpose()?
    };
    // Range validation uses HEAD only for ranged reads, keeping ordinary GETs to one backend operation.
    if let Some(range) = &range {
        let meta = app.reader.head(&key.path).await.map_err(backend_error)?;
        if range.as_range(meta.size).is_err() {
            let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                format!("bytes */{}", meta.size).parse().unwrap(),
            );
            return Ok(response);
        }
    }
    let result = app
        .reader
        .get_opts(
            &key.path,
            GetOptions {
                head,
                range: range.clone(),
                ..Default::default()
            },
        )
        .await
        .map_err(backend_error)?;
    let etag = result
        .meta
        .e_tag
        .as_ref()
        .map(|v| format!("\"{}\"", v.trim_matches('"')));
    let matches = |value: &str, weak: bool| {
        value == "*"
            || value.split(',').any(|v| {
                Some(if weak {
                    v.trim().trim_start_matches("W/")
                } else {
                    v.trim()
                }) == etag.as_deref()
            })
    };
    if text_header(headers, header::IF_MATCH)?.is_some_and(|v| !matches(&v, false)) {
        return Err(Failure(
            StatusCode::PRECONDITION_FAILED,
            "precondition failed\n",
        ));
    }
    if text_header(headers, header::IF_NONE_MATCH)?.is_some_and(|v| matches(&v, true)) {
        let mut response = StatusCode::NOT_MODIFIED.into_response();
        if let Some(etag) = etag {
            response
                .headers_mut()
                .insert(header::ETAG, etag.parse().unwrap());
        }
        return Ok(response);
    }
    let size = result.range.end - result.range.start;
    let mut builder = Response::builder()
        .status(if range.is_some() {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_LENGTH, size)
        .header(header::CONTENT_TYPE, key.content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        // Revalidate mutable metadata and action entries; allow private client caching.
        .header(header::CACHE_CONTROL, "private, max-age=0, must-revalidate");
    if let Some(etag) = etag {
        builder = builder.header(header::ETAG, etag);
    }
    if range.is_some() {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!(
                "bytes {}-{}/{}",
                result.range.start,
                result.range.end - 1,
                result.meta.size
            ),
        );
    }
    app.metrics.hits.fetch_add(1, Ordering::Relaxed);
    if head {
        return Ok(builder.body(Body::empty()).unwrap());
    }
    let timeout = Duration::from_secs(app.config.timeout);
    let stream = stream::try_unfold(
        (result.into_stream(), permit),
        move |(mut stream, permit)| async move {
            match tokio::time::timeout(timeout, stream.next()).await {
                Ok(Some(Ok(bytes))) => Ok(Some((bytes, (stream, permit)))),
                Ok(Some(Err(e))) => Err(std::io::Error::other(e)),
                Ok(None) => Ok(None),
                Err(_) => Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "download idle timeout",
                )),
            }
        },
    );
    Ok(builder.body(Body::from_stream(stream)).unwrap())
}
