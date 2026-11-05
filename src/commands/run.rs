use crate::{cli::RunArgs, db::Db, pipeline};
use anyhow::Result;

pub(super) async fn execute(args: &RunArgs, db: &Db) -> Result<()> {
    pipeline::run(args, db).await
}
