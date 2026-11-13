use super::{
    App,
    auth::authorized,
    error::{Failure, Result, backend_error},
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
};
use object_store::path::Path;
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

#[derive(Default)]
pub(super) struct Metrics {
    pub(super) requests: AtomicU64,
    pub(super) hits: AtomicU64,
    pub(super) misses: AtomicU64,
    pub(super) writes: AtomicU64,
    pub(super) bytes_written: AtomicU64,
    pub(super) rejected: AtomicU64,
}

pub(super) async fn ready(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<&'static str> {
    authorized(&app, &headers, false)?;
    let result = tokio::time::timeout(
        Duration::from_secs(app.config.timeout),
        app.store.head(&Path::from(".readiness")),
    )
    .await
    .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "backend timeout\n"))?;
    match result {
        Ok(_) | Err(object_store::Error::NotFound { .. }) => Ok("ready\n"),
        Err(e) => Err(backend_error(e)),
    }
}

pub(super) async fn metrics(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<String> {
    authorized(&app, &headers, false)?;
    let m = &app.metrics;
    let mut output = String::new();
    for (name, value) in [
        ("requests", &m.requests),
        ("hits", &m.hits),
        ("misses", &m.misses),
        ("writes", &m.writes),
        ("bytes_written", &m.bytes_written),
        ("rejected", &m.rejected),
    ] {
        output.push_str(&format!(
            "# TYPE fluentci_cache_{name}_total counter\nfluentci_cache_{name}_total {}\n",
            value.load(Ordering::Relaxed)
        ));
    }
    Ok(output)
}
