use crate::services;
use anyhow::Result;

pub(super) async fn execute(service: &str) -> Result<()> {
    services::control("stop", Some(service)).await
}
