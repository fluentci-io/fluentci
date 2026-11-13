use super::{
    App,
    error::{Failure, Result, backend_error},
    key::Key,
};
use axum::{
    body::Body,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
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

pub(super) async fn download(
    app: &App,
    key: Key,
    headers: &HeaderMap,
    head: bool,
    permit: OwnedSemaphorePermit,
) -> Result<Response> {
    let range = if head {
        None
    } else {
        text_header(headers, header::RANGE)?
            .map(|v| parse_range(&v))
            .transpose()?
    };
    // Range validation uses HEAD only for ranged reads, keeping ordinary GETs to one backend operation.
    if let Some(range) = &range {
        let meta = app.store.head(&key.path).await.map_err(backend_error)?;
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
        .store
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
