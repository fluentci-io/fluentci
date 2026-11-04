use crate::pipeline;
use anyhow::Result;

pub(super) async fn execute(pipeline: Option<&str>) -> Result<()> {
    pipeline::inspect(pipeline, "list").await
}
