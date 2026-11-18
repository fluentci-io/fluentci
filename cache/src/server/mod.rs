//! HTTP routing and streaming object transfers.
use self::{
    ops::{Metrics, metrics, ready},
    routes::handle,
};
use crate::Config;
use axum::{
    Router,
    routing::{any, get},
};
use object_store::ObjectStore;
use std::sync::Arc;
use tokio::sync::Semaphore;

mod aliases;
mod artifacts;
mod auth;
mod catalog;
mod catalog_db;
mod download;
mod error;
mod grpc;
mod key;
mod manage;
mod monorepo;
mod oci;
mod ops;
mod routes;
mod staging;
mod upload;

struct App {
    aliases: aliases::Aliases,
    catalog: Arc<catalog::Catalog>,
    config: Config,
    upload_key: Option<jsonwebtoken::DecodingKey>,
    staging: Arc<staging::Budget>,
    store: Arc<dyn ObjectStore>,
    reader: Arc<dyn ObjectStore>,
    permits: Arc<Semaphore>,
    metrics: Metrics,
}

/// Construct the cache HTTP service with a custom storage implementation.
/// Storage implementations must publish writes atomically (as object_store backends do).
pub fn router(config: Config, store: Arc<dyn ObjectStore>) -> anyhow::Result<Router> {
    config.validate()?;
    let upload_key = config
        .upload_token_public_key_file
        .as_ref()
        .map(|path| {
            jsonwebtoken::DecodingKey::from_ed_pem(&std::fs::read(path)?)
                .map_err(anyhow::Error::from)
        })
        .transpose()?;
    let (store, catalog) = catalog::IndexedStore::new(store, config.index_file.as_deref())?;
    let store: Arc<dyn ObjectStore> = store;
    let app = Arc::new(App {
        catalog,
        aliases: aliases::Aliases::new(&config.identity_resolver_url)?,
        upload_key,
        staging: staging::Budget::new(config.staging_limit, config.staging_directory.clone())?,
        permits: Arc::new(Semaphore::new(config.concurrency)),
        reader: config.read_storage(store.clone())?,
        config,
        store,
        metrics: Metrics::default(),
    });
    Ok(Router::new()
        .route("/", get(|| async { include_str!("welcome.txt") }))
        .route("/healthz", get(|| async { "ok\n" }))
        .route("/readyz", get(ready))
        .route("/metrics", get(metrics))
        .route("/{*key}", any(handle))
        .with_state(app.clone())
        .merge(grpc::router(app.clone()))
        .merge(oci::router(app)))
}
