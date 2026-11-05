use anyhow::{Context, Result};

pub(super) async fn execute(module: &str, commands: &[String]) -> Result<()> {
    let module = module.to_owned();
    let (function, arguments) = commands
        .split_first()
        .context("A plugin export name is required")?;
    let command = format!("{function} {}", arguments.join(" "));
    tokio::task::spawn_blocking(move || fluentci_engine::cmd::call::call(&module, &command)).await?
}
