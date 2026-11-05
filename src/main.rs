use clap::Parser;
use fluentci::{cli::Cli, commands};
use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();
    match commands::dispatch(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            let code = error
                .downcast_ref::<fluentci::process::Failure>()
                .and_then(|failure| failure.status.code())
                .or_else(|| {
                    error
                        .downcast_ref::<fluentci_engine::ExecutionFailure>()
                        .map(|failure| failure.exit_code)
                })
                .or_else(|| {
                    error
                        .downcast_ref::<fluentci_ext::worker::CommandFailure>()
                        .map(|failure| failure.exit_code)
                })
                .and_then(|code| u8::try_from(code).ok())
                .filter(|code| *code != 0)
                .unwrap_or(1);
            ExitCode::from(code)
        }
    }
}
