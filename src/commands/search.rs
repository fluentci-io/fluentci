use crate::registry;
use anyhow::Result;

pub(super) async fn execute(query: &str, limit: u32) -> Result<()> {
    registry::search(query, limit).await
}
