use super::{
    App,
    auth::manage_authorized,
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
    collections::BTreeMap,
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
        let _permit =
            app.permits.clone().try_acquire_owned().map_err(|_| {
                Failure(StatusCode::SERVICE_UNAVAILABLE, "cache busy; retry later\n")
            })?;
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
        "list" => {
            if input.limit == 0
                || input.limit > 200
                || input.prefix.len() > 2048
                || input.cursor.len() > 2048
            {
                return Err(Failure(StatusCode::BAD_REQUEST, "invalid pagination\n"));
            }
            let mut stream = app.store.list(Some(&prefix));
            let mut page = BTreeMap::new();
            let mut total_bytes = 0_u64;
            let mut total_keys = 0_u64;
            while let Some(meta) = stream.try_next().await.map_err(backend_error)? {
                let path = meta.location.to_string();
                let Some(relative) = path.strip_prefix(&root) else {
                    continue;
                };
                total_bytes = total_bytes.saturating_add(meta.size);
                total_keys += 1;
                if relative.starts_with(&input.prefix) && relative > input.cursor.as_str() {
                    page.insert(relative.to_owned(), json!({"key": relative, "size": meta.size, "lastModified": meta.last_modified.to_rfc3339()}));
                    if page.len() > input.limit + 1 {
                        page.pop_last();
                    }
                }
            }
            let more = page.len() > input.limit;
            if more {
                page.pop_last();
            }
            let cursor = if more {
                page.last_key_value().map(|(key, _)| key.clone())
            } else {
                None
            };
            Ok(
                json!({"keys": page.into_values().collect::<Vec<_>>(), "cursor": cursor, "totalBytes": total_bytes, "totalKeys": total_keys}),
            )
        }
        "delete" => {
            let target = key(&format!("{root}{}", input.key))?;
            if target.nix_info {
                return Err(Failure(
                    StatusCode::BAD_REQUEST,
                    "generated discovery key cannot be deleted\n",
                ));
            }
            app.store
                .delete(&target.path)
                .await
                .map_err(backend_error)?;
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
