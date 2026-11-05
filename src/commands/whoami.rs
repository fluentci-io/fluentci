use crate::{auth, db::Db};
use anyhow::Result;

pub(super) async fn execute(db: &Db) -> Result<()> {
    auth::whoami(db).await
}
