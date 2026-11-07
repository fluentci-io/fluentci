use anyhow::{Context, Result};

pub(super) async fn execute(module: &str, commands: &[String]) -> Result<()> {
    let module = module.to_owned();
    let (function, arguments) = commands
        .split_first()
        .context("A plugin export name is required")?;
    let function = function.clone();
    let arguments = arguments.to_vec();
    tokio::task::spawn_blocking(move || {
        fluentci_engine::cmd::call::call_argv(&module, &function, &arguments)
    })
    .await?
}
