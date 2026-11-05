#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use fluentci::{cli::Cli, commands};
use std::process::ExitCode;

fn main() -> ExitCode {
    let path = match fluentci_desktop::tool_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Could not prepare FluentCI tools: {error:#}");
            return ExitCode::FAILURE;
        }
    };
    // SAFETY: this runs at process startup, before creating logging, Tokio, or Tauri threads.
    unsafe {
        std::env::set_var("PATH", path);
    }
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("Could not start FluentCI: {error}");
            return ExitCode::FAILURE;
        }
    };
    // Pipeline workers relaunch current_exe. Handle these before opening a window.
    if matches!(
        std::env::args().nth(1).as_deref(),
        Some("__engine-call" | "provider-worker" | "__index-tangled")
    ) {
        return match runtime.block_on(commands::dispatch(Cli::parse())) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("error: {error:#}");
                ExitCode::FAILURE
            }
        };
    }
    let outcome = fluentci_desktop::run(&runtime);
    runtime.shutdown_timeout(std::time::Duration::from_secs(5));
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Could not start FluentCI Studio: {error:#}");
            ExitCode::FAILURE
        }
    }
}
