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

mod auth;
mod download;
mod error;
mod key;
mod ops;
mod routes;
mod upload;

struct App {
    config: Config,
    store: Arc<dyn ObjectStore>,
    permits: Arc<Semaphore>,
    metrics: Metrics,
}

/// Construct the cache HTTP service with a custom storage implementation.
/// Storage implementations must publish writes atomically (as object_store backends do).
pub fn router(config: Config, store: Arc<dyn ObjectStore>) -> anyhow::Result<Router> {
    config.validate()?;
    let app = Arc::new(App {
        permits: Arc::new(Semaphore::new(config.concurrency)),
        config,
        store,
        metrics: Metrics::default(),
    });
    Ok(Router::new()
        .route("/healthz", get(|| async { "ok\n" }))
        .route("/readyz", get(ready))
        .route("/metrics", get(metrics))
        .route("/{*key}", any(handle))
        .with_state(app))
}
