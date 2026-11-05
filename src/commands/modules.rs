use crate::{cli::ModuleCommand, modules};
use anyhow::Result;

pub(super) async fn execute(
    command: Option<ModuleCommand>,
    name: Option<&str>,
    json: bool,
) -> Result<()> {
    match command {
        Some(ModuleCommand::Add {
            name,
            sdk,
            path,
            url,
            entry,
        }) => {
            modules::add(
                &name,
                sdk,
                path.as_deref(),
                url.as_deref(),
                entry.as_deref(),
            )
            .await
        }
        None => modules::inspect(name, json).await,
    }
}
