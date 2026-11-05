use crate::{db::Db, publishing};
use anyhow::Result;
use std::path::Path;

pub(super) async fn execute(
    db: &Db,
    url: Option<&str>,
    file: Option<&Path>,
    module: Option<&str>,
    metadata: &publishing::MetadataOptions,
) -> Result<()> {
    publishing::publish(db, url, file, module, metadata).await
}
