use crate::services;
use anyhow::Result;

pub(super) async fn execute(service: &str) -> Result<()> {
    services::control("restart", Some(service)).await
}
