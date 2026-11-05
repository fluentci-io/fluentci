//! Each CLI command owns its handler; dispatch only selects the command.

use crate::{
    cli::{Cli, Command},
    db::Db,
    registry,
};
use anyhow::Result;

mod agent;
mod community;
mod docs;
mod doctor;
mod down;
mod echo;
mod engine_call;
mod env;
mod init;
mod ls;
mod modules;
mod project;
mod provider_worker;
mod ps;
mod publish;
mod repl;
mod restart;
mod run;
mod search;
mod server;
mod start;
mod status;
mod stop;
mod studio;
mod up;
mod upgrade;
mod whoami;

pub async fn dispatch(cli: Cli) -> Result<()> {
    // Workers run before opening SQLite or starting any services.
    match &cli.command {
        Some(Command::EngineCall { module, commands }) => {
            return engine_call::execute(module, commands).await;
        }
        Some(Command::ProviderWorker { request }) => return provider_worker::execute(request),
        _ => {}
    }
    let db = Db::open(&cli.database).await?;
    if cli.check_update
        && !matches!(cli.command, Some(Command::IndexTangled { .. }))
        && let Err(error) = registry::check_update(&db).await
    {
        tracing::debug!(%error, "Update check failed");
    }
    match cli.command {
        None => run::execute(&cli.run, &db).await,
        Some(Command::Run(args)) => run::execute(&args, &db).await,
        Some(Command::Install { frozen_lockfile }) => {
            crate::lockfile::install(frozen_lockfile, false, None).await
        }
        Some(Command::Update { module }) => {
            crate::lockfile::install(false, true, module.as_deref()).await
        }
        Some(Command::Init {
            name,
            template,
            standalone,
            wasm: _,
            sdk,
        }) => init::execute(name.as_deref(), template.as_deref(), standalone, sdk).await,
        Some(Command::Search { query, limit }) => search::execute(&query, limit).await,
        Some(Command::Modules {
            command,
            name,
            json,
        }) => modules::execute(command, name.as_deref(), json).await,
        Some(Command::Ls { pipeline }) => ls::execute(pipeline.as_deref()).await,
        Some(Command::Docs { pipeline }) => docs::execute(pipeline.as_deref()).await,
        Some(Command::Doctor) => doctor::execute().await,
        Some(Command::Env) => env::execute(),
        Some(Command::Whoami) => whoami::execute(&db).await,
        Some(Command::Publish {
            wasm: _,
            url,
            file,
            module,
            metadata,
        }) => {
            publish::execute(
                &db,
                url.as_deref(),
                file.as_deref(),
                module.as_deref(),
                &metadata,
            )
            .await
        }
        Some(Command::IndexTangled { account_file, did }) => {
            crate::tangled::index(&db, &account_file, &did).await
        }
        Some(Command::Agent { command }) => agent::execute(&db, command).await,
        Some(Command::Repl { debug, pipeline }) => {
            repl::execute(&db, debug, pipeline.as_deref()).await
        }
        Some(Command::Server { port }) => server::execute(db, port).await,
        Some(Command::Studio { port }) => studio::execute(db, port).await,
        Some(Command::Project { command }) => project::execute(&db, command).await,
        Some(Command::Up) => up::execute().await,
        Some(Command::Down) => down::execute().await,
        Some(Command::Ps) => ps::execute().await,
        Some(Command::Status { service }) => status::execute(&service).await,
        Some(Command::Start { service }) => start::execute(&service).await,
        Some(Command::Restart { service }) => restart::execute(&service).await,
        Some(Command::Stop { service }) => stop::execute(&service).await,
        Some(Command::Echo { service }) => echo::execute(&service).await,
        Some(Command::Community) => community::execute(),
        Some(Command::Upgrade) => upgrade::execute().await,
        Some(Command::EngineCall { .. } | Command::ProviderWorker { .. }) => {
            unreachable!("Worker modes handled before opening database")
        }
    }
}
