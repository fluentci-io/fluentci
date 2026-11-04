// OpenBSD's native Rust 1.90 requires the compatible runtime line.
#[cfg(target_os = "openbsd")]
extern crate extism_openbsd as extism;

use anyhow::Error;
use clap::{arg, Arg, Command};
use cmd::call::call;
use cmd::run::run;
use cmd::serve::serve;

pub mod cmd;

fn cli() -> Command<'static> {
    const VERSION: &str = env!("CARGO_PKG_VERSION");
    Command::new("fluentci-engine")
        .version(VERSION)
        .about(
            r#"

       ________                 __  __________   ______            _
      / ____/ /_  _____  ____  / /_/ ____/  _/  / ____/___  ____ _(_)___  ___
     / /_  / / / / / _ \/ __ \/ __/ /    / /   / __/ / __ \/ __ `/ / __ \/ _ \
    / __/ / / /_/ /  __/ / / / /_/ /____/ /   / /___/ / / / /_/ / / / / /  __/
   /_/   /_/\__,_/\___/_/ /_/\__/\____/___/  /_____/_/ /_/\__, /_/_/ /_/\___/
                                                         /____/

   A Programmable CI/CD engine without Containers, built on top of Nix ❄️
      "#,
        )
        .author("Tsiry Sandratraina <tsiry.sndr@fluentci.io>")
        .subcommand(
            Command::new("cache-diff")
                .arg(Arg::new("before").required(true))
                .arg(Arg::new("after").required(true))
                .arg(Arg::new("json").long("json"))
                .about("Compares cache key components in saved run results"),
        )
        .subcommand(
            Command::new("watch")
                .arg(
                    Arg::new("run-dir")
                        .required(true)
                        .help("Local run directory, or run UUID with --server"),
                )
                .arg(
                    Arg::new("server")
                        .long("server")
                        .takes_value(true)
                        .help("Run API origin; reads FLUENTCI_RUN_TOKEN"),
                )
                .arg(
                    Arg::new("follow")
                        .long("follow")
                        .help("Follow until the run-finished event; Ctrl-C only detaches"),
                )
                .arg(Arg::new("timeout-ms").long("timeout-ms").takes_value(true))
                .arg(
                    Arg::new("progress")
                        .long("progress")
                        .takes_value(true)
                        .possible_values(["auto", "plain", "tui", "json"])
                        .default_value("auto"),
                )
                .about("Displays an existing local execution without rerunning its plan"),
        )
        .subcommand(
            Command::new("provider-worker")
                .hide(true)
                .arg(Arg::new("request").required(true)),
        )
        .subcommand(
            Command::new("execute")
                .arg(
                    Arg::new("progress")
                        .long("progress")
                        .takes_value(true)
                        .possible_values(["auto", "plain", "tui", "json"])
                        .default_value("auto"),
                )
                .arg(Arg::new("plan").required(true))
                .arg(
                    Arg::new("run-dir")
                        .long("run-dir")
                        .takes_value(true)
                        .required(true),
                )
                .about("Executes an explicit host task plan with bounded parallelism"),
        )
        .subcommand(
            Command::new("run")
                .arg(
                    Arg::new("command")
                        .multiple_occurrences(true)
                        .multiple_values(true)
                        .required(true),
                )
                .about("Executes the specified command in a FluentCI Session"),
        )
        .subcommand(
            Command::new("call")
                .arg(arg!(-m --module <PATH> "path or url to the module to call").required(true))
                .arg(
                    Arg::new("command")
                        .multiple_occurrences(true)
                        .multiple_values(true)
                        .required(true),
                )
                .about("Calls the specified function in a FluentCI Session"),
        )
        .subcommand(
            Command::new("serve-runs")
                .arg(
                    Arg::new("listen")
                        .long("listen")
                        .takes_value(true)
                        .default_value("127.0.0.1:6881"),
                )
                .arg(
                    Arg::new("data-dir")
                        .long("data-dir")
                        .takes_value(true)
                        .required(true),
                )
                .arg(
                    Arg::new("max-runs")
                        .long("max-runs")
                        .takes_value(true)
                        .default_value("4"),
                )
                .arg(
                    Arg::new("resume-queued")
                        .long("resume-queued")
                        .help("Resume fully admitted, never-started queued runs after restart"),
                )
                .arg(
                    Arg::new("max-queued")
                        .long("max-queued")
                        .takes_value(true)
                        .default_value("0"),
                )
                .about("Serves authenticated independent host pipeline runs"),
        )
        .subcommand(
            Command::new("serve")
                .arg(arg!(--listen "The address to listen on").default_value("127.0.0.1:6880"))
                .about("Starts the FluentCI Engine server"),
        )
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    match dispatch().await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Error: {error:?}");
            let exit_code = error
                .downcast_ref::<fluentci_executor::diagnostics::ExecutionFailure>()
                .map(|failure| failure.exit_code)
                .or_else(|| {
                    error
                        .downcast_ref::<fluentci_ext::worker::CommandFailure>()
                        .map(|failure| failure.exit_code)
                })
                .unwrap_or(1);
            let code = u8::try_from(exit_code)
                .ok()
                .filter(|code| *code != 0)
                .unwrap_or(1);
            std::process::ExitCode::from(code)
        }
    }
}

async fn dispatch() -> Result<(), Error> {
    let matches = cli().get_matches();
    match matches.subcommand() {
        Some(("cache-diff", args)) => {
            cmd::cache_diff::compare(
                std::path::Path::new(args.value_of("before").unwrap()),
                std::path::Path::new(args.value_of("after").unwrap()),
                args.is_present("json"),
            )?;
        }
        Some(("watch", args)) => {
            cmd::watch::watch(
                args.value_of("run-dir").unwrap(),
                args.value_of("progress").unwrap(),
                args.is_present("follow"),
                args.value_of("timeout-ms").map(str::parse).transpose()?,
                args.value_of("server"),
            )
            .await?;
        }
        Some(("provider-worker", args)) => {
            fluentci_ext::worker::run(std::path::Path::new(args.value_of("request").unwrap()))?;
        }
        Some(("execute", args)) => {
            cmd::execute::execute(
                args.value_of("plan").unwrap(),
                args.value_of("run-dir").unwrap(),
                args.value_of("progress").unwrap(),
            )
            .await?;
        }
        Some(("run", args)) => {
            let command = args.values_of("command").unwrap();
            run(&command.collect::<Vec<_>>().join(" ")).await?;
        }
        Some(("serve-runs", args)) => {
            fluentci_server::runs::start_with_recovery(
                args.value_of("listen").unwrap(),
                std::path::Path::new(args.value_of("data-dir").unwrap()),
                args.value_of("max-runs").unwrap().parse()?,
                args.value_of("max-queued").unwrap().parse()?,
                args.is_present("resume-queued"),
            )
            .await?;
        }
        Some(("serve", args)) => {
            let listen = args.value_of("listen").unwrap();
            serve(listen).await?;
        }
        Some(("call", args)) => {
            let module = args.value_of("module").unwrap().to_owned();
            let command = args.values_of("command").unwrap();
            let command = command.collect::<Vec<_>>().join(" ");
            // Extism's synchronous WASI shims may block on Tokio internally.
            tokio::task::spawn_blocking(move || call(&module, &command)).await??;
        }
        _ => cli().print_help()?,
    };
    Ok(())
}
