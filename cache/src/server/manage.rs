use super::{
    App,
    auth::{manage_authorized, revocation_path},
    error::{Failure, Result, backend_error},
    key::key,
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::TryStreamExt;
use object_store::path::Path as StorePath;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Input {
    action: String,
    #[serde(default)]
    prefix: String,
    #[serde(default)]
    cursor: String,
    #[serde(default = "page_size")]
    limit: usize,
    #[serde(default)]
    key: String,
    #[serde(default)]
    confirm: bool,
    #[serde(default)]
    id: String,
}

fn page_size() -> usize {
    100
}

pub(super) async fn handle(
    State(app): State<Arc<App>>,
    Path(account): Path<String>,
    headers: HeaderMap,
    Json(input): Json<Input>,
) -> Response {
    let result = async {
        // Validate account using the same path rules as object transfers.
        key(&format!("accounts/{account}/generic/check"))?;
        manage_authorized(&app, &headers, &account)?;
        if app.config.read_only && input.action != "list" {
            return Err(Failure(StatusCode::FORBIDDEN, "cache is read-only\n"));
        }
        let _permit = if input.action == "list" {
            None
        } else {
            Some(app.permits.clone().try_acquire_owned().map_err(|_| {
                Failure(StatusCode::SERVICE_UNAVAILABLE, "cache busy; retry later\n")
            })?)
        };
        tokio::time::timeout(
            Duration::from_secs(app.config.timeout),
            manage(&app, &account, input),
        )
        .await
        .map_err(|_| {
            Failure(
                StatusCode::GATEWAY_TIMEOUT,
                "cache management timed out; reload to see current state\n",
            )
        })?
    }
    .await;
    match result {
        Ok(body) => ([(header::CACHE_CONTROL, "no-store")], Json(body)).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn manage(app: &App, account: &str, input: Input) -> Result<Value> {
    let root = format!("accounts/{account}/");
    let prefix = StorePath::from(format!("accounts/{account}"));
    match input.action.as_str() {
        "revokeToken" => {
            if uuid::Uuid::parse_str(&input.id).is_err() {
                return Err(Failure(StatusCode::BAD_REQUEST, "invalid token id\n"));
            }
            app.store
                .put(
                    &revocation_path(account, &input.id),
                    bytes::Bytes::from_static(b"revoked").into(),
                )
                .await
                .map_err(backend_error)?;
            Ok(json!({"revoked": true}))
        }
        "list" => {
            if input.limit == 0
                || input.limit > 200
                || input.prefix.len() > 2048
                || input.cursor.len() > 2048
            {
                return Err(Failure(StatusCode::BAD_REQUEST, "invalid pagination\n"));
            }
            app.catalog
                .page(
                    app.store.as_ref(),
                    account,
                    &input.prefix,
                    &input.cursor,
                    input.limit,
                )
                .await
                .map_err(backend_error)
        }
        "delete" => {
            // Validate every path segment, then retain the stored namespace verbatim.
            // New protocol adapters also own private metadata and payload namespaces.
            key(&format!("{root}generic/{}", input.key))?;
            if matches!(input.key.as_str(), "nix/nix-cache-info" | "nix-cache-info") {
                return Err(Failure(
                    StatusCode::BAD_REQUEST,
                    "generated discovery key cannot be deleted\n",
                ));
            }
            let target = StorePath::parse(format!("{root}{}", input.key))
                .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid key\n"))?;
            app.store.delete(&target).await.map_err(backend_error)?;
            Ok(json!({"deleted": 1}))
        }
        "clear" if input.confirm => {
            let count = AtomicU64::new(0);
            app.store
                .list(Some(&prefix))
                .try_for_each_concurrent(8, |meta| {
                    let root = &root;
                    let count = &count;
                    async move {
                        if meta.location.to_string().starts_with(root) {
                            app.store.delete(&meta.location).await?;
                            count.fetch_add(1, Ordering::Relaxed);
                        }
                        Ok(())
                    }
                })
                .await
                .map_err(backend_error)?;
            Ok(json!({"deleted": count.load(Ordering::Relaxed)}))
        }
        _ => Err(Failure(
            StatusCode::BAD_REQUEST,
            "invalid cache management action\n",
        )),
    }
}
