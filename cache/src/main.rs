use anyhow::Result;
use clap::{CommandFactory, FromArgMatches, Parser, Subcommand};
use fluentci_cache::{
    Config,
    gocache::{self, GoConfig},
    router,
};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "fluentci-cache", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the multi-protocol HTTP cache server.
    Serve(Box<Config>),
    /// Bridge Go's GOCACHEPROG stdin/stdout protocol to a cache server.
    Gocache(GoConfig),
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();
    let matches = Cli::command().get_matches();
    match Cli::from_arg_matches(&matches)?.command {
        Command::Serve(config) => {
            let config = config.resolve(matches.subcommand_matches("serve").unwrap())?;
            let store = config.storage()?;
            let address = config.bind;
            let app = router(config, store)?;
            let listener = tokio::net::TcpListener::bind(address).await?;
            tracing::info!(address = %listener.local_addr()?, "cache server listening");
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown())
                .await?;
        }
        Command::Gocache(config) => gocache::run(config).await?,
    }
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
    tracing::info!("draining cache requests");
}
