//! CI manifests are serialized as YAML so action text cannot break their structure.

mod events;

use crate::{models::Action, workflows::Definition};
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};

fn script(a: &Action) -> Result<String> {
    let mut lines = vec![
        "set -e".to_owned(),
        "export PATH=\"$HOME/.local/bin:$PATH\"".to_owned(),
    ];
    for command in crate::pipeline::action_commands(a)? {
        let words = shlex::split(&command).context("Unclosed quote in action command")?;
        if a.plugin == "shell" {
            let body = if words.first().is_some_and(|word| word == "bash") {
                words[1..].join("\n")
            } else {
                command
            };
            lines.push(format!(
                "bash -c {}",
                shlex::try_quote(&body).context("Invalid shell command")?
            ));
        } else {
            let mut args = vec!["fluentci".to_owned(), "run".to_owned()];
            if a.use_wasm {
                args.push("--wasm".into());
            }
            args.push(a.plugin.clone());
            args.extend(words);
            lines.push(
                args.iter()
                    .map(|arg| shlex::try_quote(arg).map(|s| s.into_owned()))
                    .collect::<Result<Vec<_>, _>>()
                    .context("Invalid module command")?
                    .join(" "),
            );
        }
    }
    Ok(lines.join("\n"))
}

fn script_with_context(action: &Action) -> Result<String> {
    let mut lines = vec!["(".to_owned()];
    if let Some(directory) = &action.working_directory {
        lines.push(format!(
            "cd {} || exit $?",
            shlex::try_quote(directory).context("Invalid working directory")?
        ));
    }
    for entry in action.env.iter().flatten() {
        lines.push(format!(
            "export {}",
            shlex::try_quote(entry).context("Invalid environment value")?
        ));
    }
    lines.push(script(action)?);
    lines.push(")".into());
    Ok(lines.join("\n"))
}

pub fn generate(provider: &str, actions: &[Action]) -> Result<String> {
    let enabled: Vec<_> = actions.iter().filter(|a| a.enabled).cloned().collect();
    crate::workflows::validate_actions(&enabled)?;
    let actions: Vec<_> = enabled.iter().collect();
    let setup = "bash -eo pipefail -c 'curl -fsSL https://raw.githubusercontent.com/tsirysndr/fluentci/main/install.sh | sh'";
    let mut commands: Vec<_> = actions
        .iter()
        .map(|a| script_with_context(a))
        .collect::<Result<_>>()?;
    if commands.is_empty() {
        commands.push("true".into());
    }
    let value = match provider {
        "github" => {
            let mut steps = vec![
                json!({"uses":"actions/checkout@v4"}),
                json!({"name":"Setup FluentCI","uses":"fluentci-io/setup-fluentci@next"}),
            ];
            for a in &actions {
                let mut step = json!({"name":a.name,"run":script(a)?,"shell":"bash"});
                if let Some(dir) = &a.working_directory {
                    step["working-directory"] = json!(dir);
                }
                if let Some(env) = &a.env {
                    let env: serde_json::Map<_, _> = env
                        .iter()
                        .filter_map(|v| v.split_once('='))
                        .map(|(k, v)| (k.into(), json!(v)))
                        .collect();
                    step["env"] = Value::Object(env);
                }
                steps.push(step);
            }
            json!({"name":"ci","on":{"push":{"branches":["main"]}},"jobs":{"tasks":{"runs-on":"ubuntu-latest","steps":steps}}})
        }
        "gitlab" => {
            json!({"stages":["build"],"build":{"stage":"build","image":"ubuntu:24.04","before_script":["apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git",setup],"script":commands}})
        }
        "azure" => {
            json!({"trigger":["main"],"pool":{"vmImage":"ubuntu-latest"},"steps":[{"script":format!("set -e\n{setup}\n{}",commands.join("\n")),"displayName":"FluentCI"}]})
        }
        "circleci" => {
            json!({"version":2.1,"jobs":{"build":{"machine":{"image":"ubuntu-2204:current"},"steps":["checkout",{"run":setup},{"run":commands.join("\n")}] }},"workflows":{"ci":{"jobs":["build"]}}})
        }
        "aws" => {
            json!({"version":0.2,"env":{"shell":"bash"},"phases":{"install":{"commands":[setup]},"build":{"commands":commands}}})
        }
        "semaphore" => {
            json!({"version":"v1.0","name":"ci","agent":{"machine":{"type":"e1-standard-2","os_image":"ubuntu2404"}},"blocks":[{"name":"Pipeline","task":{"prologue":{"commands":["checkout",setup]},"jobs":[{"name":"FluentCI","commands":commands}]}}]})
        }
        _ => bail!("Unknown CI provider {provider:?}"),
    };
    Ok(serde_yaml::to_string(&value)?)
}

/// Export CI event constraints without applying them to local execution.
pub fn generate_workflow(provider: &str, definition: &Definition) -> Result<String> {
    definition.validate()?;
    let mut config: Value = serde_yaml::from_str(&generate(provider, &definition.run_actions()?)?)?;
    let notes = events::apply(provider, definition, &mut config)?;
    let mut output = String::new();
    for note in notes {
        for line in note.lines() {
            output.push_str("# ");
            output.push_str(line);
            output.push('\n');
        }
    }
    output.push_str(&serde_yaml::to_string(&config)?);
    Ok(output)
}
