//! Interactive commands use the same Rust pipeline runner as noninteractive invocations.

use crate::{
    cli::{Cli, Command, RunArgs},
    db::Db,
    modules, pipeline,
};
use anyhow::{Result, bail};
use clap::Parser;
use std::io::{BufRead, IsTerminal, Write};
use tokio::sync::mpsc;

const HELP: &str = "Commands:
  run [module] [function] [args...]  Run a pipeline or module function
  modules [name]                   Discover modules and their functions
  help                             Show this help
  exit                             Leave the session

With a module selected, enter a function name and its arguments directly.";

pub async fn run(db: &Db, debug: bool, selected: Option<&str>) -> Result<()> {
    println!("FluentCI REPL — type help for commands, exit to leave.");
    if let Some(module) = selected {
        println!("Selected module: {module}");
    }
    let terminal = std::io::stdin().is_terminal();
    let (sender, mut lines) = mpsc::channel(1);
    // A detached stdin reader lets Ctrl-C end the session without waiting for
    // Tokio's blocking stdin task to finish another read.
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let failed = line.is_err();
            if sender.blocking_send(line).is_err() || failed {
                break;
            }
        }
    });
    loop {
        if terminal {
            print!("fluentci> ");
            std::io::stdout().flush()?;
        }
        let line = tokio::select! {
            line = lines.recv() => line.transpose()?,
            signal = tokio::signal::ctrl_c() => {
                signal?;
                break;
            }
        };
        let Some(line) = line else { break };
        let Some(words) = shlex::split(&line) else {
            eprintln!("error: Unclosed quote in command");
            continue;
        };
        let Some((command, arguments)) = words.split_first() else {
            continue;
        };
        if matches!(command.as_str(), "exit" | "quit") {
            break;
        }
        if let Err(error) = execute(db, selected, command, arguments).await {
            if debug {
                eprintln!("error: {error:?}");
            } else {
                eprintln!("error: {error:#}");
            }
        }
    }
    Ok(())
}

async fn execute(
    db: &Db,
    selected: Option<&str>,
    command: &str,
    arguments: &[String],
) -> Result<()> {
    match command {
        "help" => {
            println!("{HELP}");
            Ok(())
        }
        "modules" | "inspect" | "ls" => {
            if arguments.len() > 1 {
                bail!("Usage: modules [name]");
            }
            modules::inspect(arguments.first().map(String::as_str), false).await
        }
        "run" => {
            let cli = Cli::try_parse_from(
                ["fluentci", "run"]
                    .into_iter()
                    .chain(arguments.iter().map(String::as_str)),
            )?;
            let Some(Command::Run(args)) = cli.command else {
                unreachable!("run was explicitly selected")
            };
            pipeline::run(&args, db).await
        }
        function => {
            let args = if let Some(module) = selected {
                RunArgs {
                    pipeline: Some(module.into()),
                    jobs: std::iter::once(function.to_owned())
                        .chain(arguments.iter().cloned())
                        .collect(),
                    ..RunArgs::default()
                }
            } else {
                RunArgs {
                    pipeline: Some(function.into()),
                    jobs: arguments.to_vec(),
                    ..RunArgs::default()
                }
            };
            pipeline::run(&args, db).await
        }
    }
}
