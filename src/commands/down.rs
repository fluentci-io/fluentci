use crate::services;
use anyhow::Result;

pub(super) async fn execute() -> Result<()> {
    services::control("down", None).await
}
