use crate::{cli::AgentCommand, db::Db, remote};
use anyhow::Result;

pub(super) async fn execute(db: &Db, command: Option<AgentCommand>) -> Result<()> {
    match command {
        Some(AgentCommand::List) => remote::list_agents(db).await,
        None => remote::agent(db).await,
    }
}
