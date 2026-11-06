use fluentci::{export, models::Action, workflows::Definition};
use serde_json::{Value, json};
use std::{
    io::Write,
    process::{Command, Stdio},
};

const PROVIDERS: [&str; 6] = ["github", "gitlab", "azure", "circleci", "aws", "semaphore"];

fn action(plugin: &str, commands: &str) -> Action {
    Action {
        name: "Check: 'quoted' # step".into(),
        plugin: plugin.into(),
        commands: commands.into(),
        enabled: true,
        use_wasm: true,
        env: Some(vec![
            "MESSAGE=value with $dollars, 'quotes' and = signs".into(),
        ]),
        working_directory: Some("source dir".into()),
        ..Default::default()
    }
}

fn scripts(provider: &str, value: &Value) -> Vec<String> {
    let strings = |array: &Value| {
        array
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s.as_str().unwrap().to_owned())
            .collect()
    };
    match provider {
        "github" => value["jobs"]["tasks"]["steps"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|s| s["run"].as_str().map(str::to_owned))
            .collect(),
        "gitlab" => strings(&value["build"]["script"]),
        "azure" => vec![value["steps"][0]["script"].as_str().unwrap().into()],
        "circleci" => value["jobs"]["build"]["steps"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|s| s["run"].as_str().map(str::to_owned))
            .collect(),
        "aws" => strings(&value["phases"]["build"]["commands"]),
        "semaphore" => strings(&value["blocks"][0]["task"]["jobs"][0]["commands"]),
        _ => unreachable!(),
    }
}

#[test]
fn every_provider_preserves_context_quotes_arguments_and_omits_disabled_steps() -> anyhow::Result<()>
{
    let step = action(
        "@alice.example/package@v1.0.0",
        "build 'literal $(touch injected)' 'a|b'\ntest",
    );
    let mut disabled = step.clone();
    disabled.name = "DISABLED_SENTINEL".into();
    disabled.enabled = false;
    for provider in PROVIDERS {
        let yaml = export::generate(provider, &[step.clone(), disabled.clone()])?;
        let value: Value = serde_yaml::from_str(&yaml)?;
        assert!(!yaml.contains("DISABLED_SENTINEL"));
        let commands = scripts(provider, &value);
        assert!(!commands.is_empty());
        let body = commands.join("\n");
        let invocation = body
            .lines()
            .find(|l| l.starts_with("fluentci run"))
            .unwrap();
        assert_eq!(
            shlex::split(invocation).unwrap(),
            [
                "fluentci",
                "run",
                "--wasm",
                "@alice.example/package@v1.0.0",
                "build",
                "literal $(touch injected)",
                "a|b"
            ]
        );
        if provider == "github" {
            let entry = &value["jobs"]["tasks"]["steps"][2];
            assert_eq!(entry["working-directory"], "source dir");
            assert_eq!(
                entry["env"]["MESSAGE"],
                "value with $dollars, 'quotes' and = signs"
            );
            assert_eq!(entry["shell"], "bash");
        } else {
            assert!(body.contains("cd 'source dir'"), "{provider}: {body}");
            assert!(body.contains("export 'MESSAGE="), "{provider}: {body}");
        }
        for body in commands {
            let mut child = Command::new("bash")
                .arg("-n")
                .stdin(Stdio::piped())
                .spawn()?;
            child.stdin.take().unwrap().write_all(body.as_bytes())?;
            assert!(child.wait()?.success(), "{provider}: invalid Bash");
        }
    }
    Ok(())
}

#[test]
fn provider_scaffolds_have_required_structure_even_without_steps() -> anyhow::Result<()> {
    for provider in PROVIDERS {
        let value: Value = serde_yaml::from_str(&export::generate(provider, &[])?)?;
        match provider {
            "github" => assert_eq!(value["jobs"]["tasks"]["runs-on"], "ubuntu-latest"),
            "gitlab" => {
                assert_eq!(value["build"]["image"], "ubuntu:24.04");
                assert!(
                    value["build"]["before_script"][0]
                        .as_str()
                        .unwrap()
                        .contains("ca-certificates curl git")
                );
            }
            "azure" => assert_eq!(value["pool"]["vmImage"], "ubuntu-latest"),
            "circleci" => {
                assert_eq!(value["version"], 2.1);
                assert!(value["workflows"]["ci"]["jobs"].is_array());
            }
            "aws" => {
                assert_eq!(value["version"], 0.2);
                assert_eq!(value["env"]["shell"], "bash");
            }
            "semaphore" => {
                assert_eq!(value["version"], "v1.0");
                assert_eq!(value["agent"]["machine"]["os_image"], "ubuntu2404");
                assert_eq!(
                    value["blocks"][0]["task"]["prologue"]["commands"][0],
                    "checkout"
                );
                assert_eq!(
                    value["blocks"][0]["task"]["jobs"].as_array().unwrap().len(),
                    1
                );
            }
            _ => unreachable!(),
        }
        assert!(
            scripts(provider, &value)
                .iter()
                .all(|s| !s.trim().is_empty())
        );
    }
    Ok(())
}

#[test]
fn exported_shell_failure_stops_later_steps() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let mut failure = action("shell", "exit 17");
    failure.env = None;
    failure.working_directory = None;
    let mut later = failure.clone();
    later.name = "Must not run".into();
    later.commands = "touch should-not-exist".into();
    for provider in ["gitlab", "circleci", "aws", "semaphore"] {
        let value: Value = serde_yaml::from_str(&export::generate(
            provider,
            &[failure.clone(), later.clone()],
        )?)?;
        let body = format!(
            "set -e\n{}",
            scripts(provider, &value)
                .into_iter()
                .filter(|s| !s.contains("curl -fsSL"))
                .collect::<Vec<_>>()
                .join("\n")
        );
        let status = Command::new("bash")
            .args(["-c", &body])
            .current_dir(temp.path())
            .status()?;
        assert_eq!(status.code(), Some(17), "{provider}");
        assert!(!temp.path().join("should-not-exist").exists());
    }
    Ok(())
}

#[test]
fn semaphore_filters_target_branch_tags_and_manual_events() -> anyhow::Result<()> {
    let step = action("shell", "printf executed");
    let mut definition = Definition::from_actions("checks".into(), "Checks".into(), None, &[step]);
    definition.steps[0].working_directory = None;
    definition.events.pull_request = Some(Default::default());
    definition.events.pull_request.as_mut().unwrap().branches = vec!["main".into()];
    let value: Value = serde_yaml::from_str(&export::generate_workflow("semaphore", &definition)?)?;
    let body = scripts("semaphore", &value).join("\n");
    for (hook, kind, branch, manual, expected) in [
        ("true", "branch", "main", "false", true),
        ("true", "branch", "other", "false", false),
        ("true", "pull-request", "main", "false", true),
        ("true", "pull-request", "other", "false", false),
        ("true", "tag", "main", "false", false),
        ("false", "branch", "other", "true", true),
    ] {
        let output = Command::new("bash")
            .args(["-c", &body])
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .envs([
                ("SEMAPHORE_WORKFLOW_TRIGGERED_BY_HOOK", hook),
                ("SEMAPHORE_GIT_REF_TYPE", kind),
                ("SEMAPHORE_GIT_BRANCH", branch),
                ("SEMAPHORE_WORKFLOW_TRIGGERED_BY_MANUAL_RUN", manual),
            ])
            .output()?;
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).contains("executed"),
            expected
        );
    }
    definition
        .events
        .push
        .as_mut()
        .unwrap()
        .paths
        .push("src/**".into());
    assert!(export::generate_workflow("semaphore", &definition).is_err());
    assert!(export::generate("unknown", &[]).is_err());
    let mut invalid = action("shell", "printf ok");
    invalid.env = Some(vec!["BAD-NAME=value".into()]);
    assert!(export::generate("github", &[invalid]).is_err());
    assert_eq!(value["name"], json!("Checks"));
    Ok(())
}
