use super::{
    App,
    auth::authorized,
    download::download,
    error::{Failure, Result},
    key::key,
    upload::upload,
};
use axum::{
    body::Body,
    extract::{Path as UrlPath, Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
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
    authorized(app, request.headers(), read)?;
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
    let key = key(raw)?;
    let permit = app
        .permits
        .clone()
        .try_acquire_owned()
        .map_err(|_| Failure(StatusCode::SERVICE_UNAVAILABLE, "cache busy; retry later\n"))?;
    let deadline = Duration::from_secs(app.config.timeout);
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
