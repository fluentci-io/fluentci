use clap::{CommandFactory, Parser};
use fluentci::cli::{Cli, Command};

#[test]
fn clap_definition_is_valid() {
    Cli::command().debug_assert();
}

#[test]
fn publish_accepts_metadata_flags_and_missing_fields_for_prompts() {
    for (flag, value) in [
        ("--file", "plugin.wasm"),
        ("--url", "https://example.com/plugin.wasm"),
    ] {
        assert!(Cli::try_parse_from(["fluentci", "publish", flag, value]).is_ok());
        let cli = Cli::try_parse_from(["fluentci", "publish", flag, value, "--name", "my-plugin"])
            .unwrap();
        assert!(
            matches!(cli.command, Some(Command::Publish { metadata, .. }) if metadata.name.as_deref() == Some("my-plugin"))
        );
        assert!(
            Cli::try_parse_from([
                "fluentci",
                "publish",
                flag,
                value,
                "--module",
                "ci",
                "--name",
                "my-plugin"
            ])
            .is_ok()
        );
    }
    assert!(Cli::try_parse_from(["fluentci", "publish", "--module", "ci"]).is_ok());
    assert!(
        Cli::try_parse_from([
            "fluentci",
            "publish",
            "--module",
            "ci",
            "--name",
            "my-plugin"
        ])
        .is_ok()
    );
    assert!(
        Cli::try_parse_from([
            "fluentci",
            "publish",
            "--name",
            "my-plugin",
            "--file",
            "plugin.wasm",
            "--url",
            "https://example.com/plugin.wasm"
        ])
        .is_err()
    );
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
    assert!(Cli::try_parse_from(["fluentci", "project", "export", "--semaphore"]).is_ok());
    assert!(
        Cli::try_parse_from(["fluentci", "project", "export", "--semaphore", "--aws"]).is_err()
    );
    assert!(
        Cli::try_parse_from(["fluentci", "project", "export", "--github", "--gitlab"]).is_err()
    );
}

#[test]
fn initializes_and_runs_the_default_rust_module() -> anyhow::Result<()> {
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
    let listing = String::from_utf8_lossy(&list.stdout);
    assert!(listing.contains("main [rust]"));
    assert!(listing.lines().any(|line| line == "hello"));
    assert!(temp.path().join("fluentci.toml").is_file());
    assert!(temp.path().join(".fluentci/main/Cargo.toml").is_file());
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

#[test]
fn workflows_list_and_step_details_parse_without_running_cli() {
    let cli = Cli::try_parse_from(["fluentci", "workflows", "--steps", "--json"]).unwrap();
    assert!(matches!(
        cli.command,
        Some(Command::Workflows {
            json: true,
            steps: true,
            ..
        })
    ));
    let cli = Cli::try_parse_from(["fluentci", "run", "--workflow", "release"]).unwrap();
    assert!(
        matches!(cli.command, Some(Command::Run(args)) if args.workflow.as_deref() == Some("release"))
    );
    assert!(Cli::try_parse_from(["fluentci", "run", "--workflow", "release", "--wasm"]).is_err());
}

#[test]
fn workflow_details_can_select_one_workflow() {
    let cli = Cli::try_parse_from(["fluentci", "workflows", "ci", "--steps"]).unwrap();
    assert!(
        matches!(cli.command, Some(Command::Workflows {workflow: Some(id), steps:true, ..}) if id == "ci")
    );
}
