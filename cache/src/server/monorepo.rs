use super::{
    App, artifacts,
    auth::{authorized, upload_authorized},
    error::{Failure, Result},
    key::key,
};
use axum::{
    Json,
    body::to_bytes,
    extract::{Path, Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc, time::Duration};

pub(super) async fn nx(
    State(app): State<Arc<App>>,
    Path((account, hash)): Path<(String, String)>,
    request: Request,
) -> Response {
    run(app, account, "nx", hash, request).await
}

pub(super) async fn turbo(
    State(app): State<Arc<App>>,
    Path((account, rest)): Path<(String, String)>,
    request: Request,
) -> Response {
    run(app, account, "turbo", rest, request).await
}

async fn run(
    app: Arc<App>,
    account: String,
    protocol: &str,
    rest: String,
    request: Request,
) -> Response {
    let result = async {
        key(&format!("accounts/{account}/generic/check"))?;
        let method = request.method().clone();
        let read = method == Method::GET || method == Method::HEAD;
        if read {
            authorized(&app, request.headers(), true)?;
        } else {
            upload_authorized(&app, request.headers(), Some(&account)).await?;
        }
        if !read && app.config.read_only {
            return Err(Failure(StatusCode::FORBIDDEN, "cache is read-only\n"));
        }
        let permit = if read && super::download::redirects(&app) {
            None
        } else {
            Some(app.permits.clone().try_acquire_owned().map_err(|_| {
                Failure(StatusCode::SERVICE_UNAVAILABLE, "cache busy; retry later\n")
            })?)
        };
        tokio::time::timeout(
            Duration::from_secs(app.config.timeout),
            inner(&app, &account, protocol, &rest, request, permit),
        )
        .await
        .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "cache timeout\n"))?
    }
    .await;
    result.unwrap_or_else(IntoResponse::into_response)
}

async fn inner(
    app: &App,
    account: &str,
    protocol: &str,
    rest: &str,
    request: Request,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
) -> Result<Response> {
    let method = request.method().clone();
    let rest = if protocol == "turbo" {
        rest.strip_prefix("v8/").unwrap_or(rest)
    } else {
        rest
    };
    if protocol == "turbo" {
        if let Some(query) = request.uri().query() {
            for (name, value) in reqwest::Url::parse(&format!("http://cache/?{query}"))
                .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid query\n"))?
                .query_pairs()
            {
                if matches!(name.as_ref(), "teamId" | "slug")
                    && value != account
                    && value != format!("team_{account}")
                    && value != super::aliases::legacy_account(account)
                    && value != format!("team_{}", super::aliases::legacy_account(account))
                {
                    return Err(Failure(
                        StatusCode::FORBIDDEN,
                        "team does not match account cache\n",
                    ));
                }
            }
        }
        if rest == "artifacts/status" && method == Method::GET {
            upload_authorized(app, request.headers(), Some(account)).await?;
            return Ok(Json(json!({"status":"enabled"})).into_response());
        }
        if rest == "artifacts/events" && method == Method::POST {
            let events: Vec<Value> = serde_json::from_slice(
                &to_bytes(request.into_body(), 65536)
                    .await
                    .map_err(|_| Failure(StatusCode::BAD_REQUEST, "events too large\n"))?,
            )
            .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid events\n"))?;
            if events.len() > 1000 {
                return Err(Failure(StatusCode::BAD_REQUEST, "too many events\n"));
            }
            return Ok(StatusCode::OK.into_response());
        }
        if rest == "artifacts" && method == Method::POST {
            let input: Value = serde_json::from_slice(
                &to_bytes(request.into_body(), 65536)
                    .await
                    .map_err(|_| Failure(StatusCode::BAD_REQUEST, "query too large\n"))?,
            )
            .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid query\n"))?;
            let hashes = input["hashes"]
                .as_array()
                .filter(|v| v.len() <= 100)
                .ok_or(Failure(
                    StatusCode::BAD_REQUEST,
                    "expected up to 100 hashes\n",
                ))?;
            let mut output = serde_json::Map::new();
            for hash in hashes {
                let hash = hash
                    .as_str()
                    .ok_or(Failure(StatusCode::BAD_REQUEST, "invalid hash\n"))?;
                let value = match artifacts::metadata(app, account, protocol, hash).await {
                    Ok(meta) => {
                        json!({"size":meta.size,"taskDurationMs":meta.headers.get("x-artifact-duration").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),"tag":meta.headers.get("x-artifact-tag")})
                    }
                    Err(error) if error.0 == StatusCode::NOT_FOUND => Value::Null,
                    Err(error) => return Err(error),
                };
                output.insert(hash.into(), value);
            }
            return Ok(Json(Value::Object(output)).into_response());
        }
    }
    let hash = if protocol == "turbo" {
        rest.strip_prefix("artifacts/")
            .ok_or(Failure(StatusCode::NOT_FOUND, "unknown turbo endpoint\n"))?
    } else {
        rest
    };
    artifacts::pointer(account, protocol, hash)?;
    if protocol == "turbo" && !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "expected hexadecimal artifact hash\n",
        ));
    }
    if method == Method::GET || method == Method::HEAD {
        return artifacts::get(
            app,
            account,
            protocol,
            hash,
            request.headers(),
            method == Method::HEAD,
            permit,
        )
        .await;
    }
    if method != Method::PUT {
        return Ok((
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD, PUT")],
        )
            .into_response());
    }
    let size = request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or(Failure(
            StatusCode::BAD_REQUEST,
            "content length required\n",
        ))?;
    if size > app.config.max_upload {
        return Err(Failure(
            StatusCode::PAYLOAD_TOO_LARGE,
            "upload exceeds limit\n",
        ));
    }
    let mut headers = BTreeMap::new();
    if protocol == "turbo" {
        for name in [
            "x-artifact-duration",
            "x-artifact-tag",
            "x-artifact-sha",
            "x-artifact-dirty-hash",
        ] {
            if let Some(value) = request.headers().get(name) {
                let value = value
                    .to_str()
                    .ok()
                    .filter(|v| v.len() <= 600)
                    .ok_or(Failure(
                        StatusCode::BAD_REQUEST,
                        "invalid artifact header\n",
                    ))?;
                if name == "x-artifact-duration" && value.parse::<u64>().is_err() {
                    return Err(Failure(
                        StatusCode::BAD_REQUEST,
                        "invalid artifact duration\n",
                    ));
                }
                headers.insert(name.into(), value.into());
            }
        }
    }
    artifacts::put(
        app,
        (account, protocol, hash),
        headers,
        size,
        request.into_body(),
        protocol == "nx",
    )
    .await?;
    if protocol == "nx" {
        Ok(StatusCode::OK.into_response())
    } else {
        Ok((StatusCode::ACCEPTED, Json(json!({"urls":[]}))).into_response())
    }
}
