use crate::{cli::ServiceCommand, services, workspace::Workspace};
use anyhow::Result;
use tokio::io::AsyncReadExt;

pub(super) async fn execute(command: ServiceCommand) -> Result<()> {
    let root = Workspace::current()?.root;
    match command {
        ServiceCommand::Apply { json, file } => {
            let json = if let Some(json) = json {
                json
            } else if let Some(file) = file {
                if file.as_os_str() == "-" {
                    let mut json = String::new();
                    tokio::io::stdin()
                        .take(1024 * 1024 + 1)
                        .read_to_string(&mut json)
                        .await?;
                    json
                } else {
                    tokio::fs::read_to_string(file).await?
                }
            } else {
                unreachable!()
            };
            anyhow::ensure!(
                json.len() <= 1024 * 1024,
                "Service definitions exceed 1 MiB"
            );
            let definitions = serde_json::from_str(&json)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&services::apply(&root, definitions).await?)?
            );
            Ok(())
        }
        ServiceCommand::Status { json } => {
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&services::status(&root).await?)?
                );
                Ok(())
            } else {
                services::control("ps", None).await
            }
        }
        ServiceCommand::Run {
            services: names,
            command,
        } => services::scoped(&root, names, command).await,
    }
}
