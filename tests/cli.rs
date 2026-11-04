use clap::{CommandFactory, Parser};
use fluentci::cli::{Cli, Command};

#[test]
fn clap_definition_is_valid() {
    Cli::command().debug_assert();
}

#[test]
fn forwards_plugin_flags_verbatim() {
    let c = Cli::try_parse_from([
        "fluentci",
        "run",
        "--wasm",
        "bun",
        "run",
        "test",
        "--timeout",
        "100",
        "--check-update=false",
    ])
    .unwrap();
    let Some(Command::Run(args)) = c.command else {
        panic!("Expected run")
    };
    assert!(args.wasm);
    assert_eq!(
        args.jobs,
        ["run", "test", "--timeout", "100", "--check-update=false"]
    );
}

#[test]
fn supports_implicit_run_and_aliases() {
    let c = Cli::try_parse_from(["fluentci", "--wasm", "rust", "test"]).unwrap();
    assert!(c.command.is_none());
    assert_eq!(c.run.pipeline.as_deref(), Some("rust"));
    assert!(matches!(
        Cli::try_parse_from(["fluentci", "list"]).unwrap().command,
        Some(Command::Ls { .. })
    ));
    assert!(matches!(
        Cli::try_parse_from(["fluentci", "man", "rust"])
            .unwrap()
            .command,
        Some(Command::Docs { .. })
    ));
}

#[test]
fn rejects_invalid_ports_and_conflicting_providers() {
    assert!(Cli::try_parse_from(["fluentci", "studio", "--port", "70000"]).is_err());
    assert!(
        Cli::try_parse_from(["fluentci", "project", "export", "--github", "--gitlab"]).is_err()
    );
}

#[test]
fn initializes_and_runs_a_pipeline_without_external_runtimes() -> anyhow::Result<()> {
    use std::process::Command as Process;

    let temp = tempfile::tempdir()?;
    let binary = env!("CARGO_BIN_EXE_fluentci");
    let database = temp.path().join("db");
    let cli = |command: &str| {
        let mut process = Process::new(binary);
        process
            .args(["--check-update=false", "--database"])
            .arg(&database)
            .arg(command)
            .current_dir(temp.path())
            .env_remove("FLUENTCI_PROJECT_ID");
        process
    };
    assert!(cli("init").output()?.status.success());
    let list = cli("ls").output()?;
    assert_eq!(String::from_utf8_lossy(&list.stdout).trim(), "hello");
    let run = cli("run").output()?;
    assert!(
        run.status.success(),
        "{}",
        String::from_utf8_lossy(&run.stderr)
    );
    assert!(String::from_utf8_lossy(&run.stdout).contains("Hello from FluentCI"));
    assert!(!cli("init").output()?.status.success());
    let mut unknown = cli("run");
    unknown.args([".", "missing"]);
    assert!(!unknown.output()?.status.success());
    Ok(())
}

#[test]
fn every_public_command_and_argument_has_help() {
    fn check(command: &clap::Command, path: &str) {
        for argument in command
            .get_arguments()
            .filter(|argument| !argument.is_hide_set())
        {
            assert!(
                argument
                    .get_help()
                    .is_some_and(|help| !help.to_string().trim().is_empty()),
                "{path}: argument {} has no description",
                argument.get_id(),
            );
        }

        for subcommand in command
            .get_subcommands()
            .filter(|subcommand| !subcommand.is_hide_set())
        {
            let path = format!("{path} {}", subcommand.get_name());
            assert!(
                subcommand
                    .get_about()
                    .is_some_and(|about| !about.to_string().trim().is_empty()),
                "{path}: command has no description",
            );
            if subcommand.get_name() != "help" {
                check(subcommand, &path);
            }
        }
    }

    let mut command = Cli::command();
    command.build();
    check(&command, "fluentci");
}

#[test]
fn dependency_cache_command_is_not_exposed() {
    let mut command = Cli::command();
    command.build();
    assert!(command.find_subcommand("cache").is_none());
    assert!(!command.render_help().to_string().contains("cache      "));
}
