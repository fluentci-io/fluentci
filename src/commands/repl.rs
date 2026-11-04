use crate::{db::Db, repl};
use anyhow::Result;

pub(super) async fn execute(db: &Db, debug: bool, pipeline: Option<&str>) -> Result<()> {
    repl::run(db, debug, pipeline).await
}
