use crate::{db::Db, server};
use anyhow::Result;

pub(super) async fn execute(db: Db, port: u16) -> Result<()> {
    server::serve(db, port, false).await
}
