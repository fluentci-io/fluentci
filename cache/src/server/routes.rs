use super::{
    App,
    auth::{authorized, upload_authorized},
    download::download,
    error::{Failure, Result, backend_error},
    key::key,
    upload::upload,
};
use crate::config::Backend;
use axum::{
    Json,
    body::Body,
    extract::{FromRequest, Path as UrlPath, Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
};
use std::{
    sync::{Arc, atomic::Ordering},
    time::Duration,
};

pub(super) async fn handle(
    State(app): State<Arc<App>>,
    UrlPath(raw): UrlPath<String>,
    request: Request,
) -> Response {
    let raw = match app.aliases.canonical(&raw).await {
        Ok(Some(canonical)) => canonical,
        Ok(None) => raw,
        Err(error) => return error.into_response(),
    };
    // Short aliases must dispatch to the same protocol handlers as hash URLs.
    if let Some(scoped) = raw.strip_prefix("accounts/")
        && let Some((account, rest)) = scoped.split_once('/')
    {
        if rest == "_admin" && request.method() == Method::POST {
            let headers = request.headers().clone();
            let input = match Json::<super::manage::Input>::from_request(request, &()).await {
                Ok(input) => input,
                Err(error) => return error.into_response(),
            };
            return super::manage::handle(State(app), UrlPath(account.to_owned()), headers, input)
                .await;
        }
        if let Some(rest) = rest.strip_prefix("turbo/") {
            return super::monorepo::turbo(
                State(app),
                UrlPath((account.to_owned(), rest.to_owned())),
                request,
            )
            .await;
        }
        if let Some(hash) = rest.strip_prefix("nx/v1/cache/") {
            return super::monorepo::nx(
                State(app),
                UrlPath((account.to_owned(), hash.to_owned())),
                request,
            )
            .await;
        }
    }
    app.metrics.requests.fetch_add(1, Ordering::Relaxed);
    let result = handle_inner(&app, &raw, request).await;
    if let Err(error) = &result {
        if error.0 == StatusCode::NOT_FOUND {
            app.metrics.misses.fetch_add(1, Ordering::Relaxed);
        } else {
            app.metrics.rejected.fetch_add(1, Ordering::Relaxed);
        }
    }
    result.unwrap_or_else(IntoResponse::into_response)
}

async fn handle_inner(app: &Arc<App>, raw: &str, request: Request) -> Result<Response> {
    let method = request.method().clone();
    let read = method == Method::GET || method == Method::HEAD;
    let key = key(raw)?;
    if method == Method::PUT {
        upload_authorized(app, request.headers(), key.account.as_deref()).await?;
    } else {
        authorized(app, request.headers(), read)?;
    }
    if !read && method != Method::PUT {
        return Ok((
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD, PUT")],
        )
            .into_response());
    }
    if !read && app.config.read_only {
        return Err(Failure(StatusCode::FORBIDDEN, "cache is read-only\n"));
    }
    // Authenticate first, then avoid reading a duplicate immutable NAR body.
    // Narinfo and mutable protocol keys must retain normal replacement behavior.
    if method == Method::PUT && key.is_immutable_nix_payload() {
        match tokio::time::timeout(Duration::from_secs(10), app.store.head(&key.path))
            .await
            .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "cache lookup timed out\n"))?
        {
            Ok(_) => return Ok(StatusCode::OK.into_response()),
            Err(object_store::Error::NotFound { .. }) => {}
            Err(error) => return Err(backend_error(error)),
        }
    }
    if key.nix_info {
        if !read {
            return Err(Failure(
                StatusCode::FORBIDDEN,
                "nix-cache-info is managed by the server\n",
            ));
        }
        let data = format!(
            "StoreDir: /nix/store\nWantMassQuery: 0\nPriority: {}\n",
            app.config.nix_priority
        );
        let size = data.len();
        let mut response = if method == Method::HEAD {
            Body::empty()
        } else {
            Body::from(data)
        }
        .into_response();
        response
            .headers_mut()
            .insert(header::CONTENT_LENGTH, size.into());
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            "text/x-nix-cache-info".parse().unwrap(),
        );
        return Ok(response);
    }
    // Public Nix reads need no backend connection or transfer permit. Redirect
    // even misses to the CDN, which returns the real 404 instead of a busy 503.
    // Private reads keep the authenticated proxy path.
    if read && key.is_nix() && app.config.public_read && matches!(app.config.backend, Backend::S3) {
        let mut url =
            reqwest::Url::parse(app.config.cdn_url.as_deref().expect("validated S3 CDN URL"))
                .expect("validated S3 CDN URL");
        {
            let mut segments = url.path_segments_mut().expect("validated HTTP CDN URL");
            segments.pop_if_empty();
            segments.extend(app.config.prefix.split('/').filter(|part| !part.is_empty()));
            segments.extend(key.path.as_ref().split('/'));
        }
        return Ok(Redirect::temporary(url.as_str()).into_response());
    }
    let permit = app
        .permits
        .clone()
        .try_acquire_owned()
        .map_err(|_| Failure(StatusCode::SERVICE_UNAVAILABLE, "cache busy; retry later\n"))?;
    let deadline = Duration::from_secs(app.config.timeout);
    if read {
        tokio::time::timeout(
            deadline,
            download(app, key, request.headers(), method == Method::HEAD, permit),
        )
        .await
        .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "backend timeout\n"))?
    } else {
        if let Some(length) = request.headers().get(header::CONTENT_LENGTH) {
            let length = length
                .to_str()
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .ok_or(Failure(StatusCode::BAD_REQUEST, "invalid content length\n"))?;
            if length > app.config.max_upload {
                return Err(Failure(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "upload exceeds limit\n",
                ));
            }
        }
        tokio::time::timeout(deadline, upload(app, key, request.into_body()))
            .await
            .map_err(|_| Failure(StatusCode::REQUEST_TIMEOUT, "upload timeout\n"))?
    }
}
