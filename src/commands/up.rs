use crate::services;
use anyhow::Result;

pub(super) async fn execute() -> Result<()> {
    services::control("up", None).await
}
