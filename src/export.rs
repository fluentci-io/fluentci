//! CI manifests are serialized as YAML so action text cannot break their structure.

use crate::models::Action;
use anyhow::{Result, bail};
use serde_json::{Value, json};

fn script(a: &Action) -> String {
    let commands = a
        .commands
        .lines()
        .map(|c| {
            format!(
                "fluentci run {} {} {c}",
                if a.use_wasm { "--wasm" } else { "" },
                a.plugin
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("export PATH=\"$HOME/.local/bin:$PATH\"\n{commands}")
}

pub fn generate(provider: &str, actions: &[Action]) -> Result<String> {
    let actions: Vec<_> = actions.iter().filter(|a| a.enabled).collect();
    let setup =
        "curl -fsSL https://raw.githubusercontent.com/tsirysndr/fluentci/main/install.sh | sh";
    let commands: Vec<_> = actions.iter().map(|a| script(a)).collect();
    let value = match provider {
        "github" => {
            let mut steps = vec![
                json!({"uses":"actions/checkout@v4"}),
                json!({"name":"Setup FluentCI","uses":"fluentci-io/setup-fluentci@next"}),
            ];
            for a in &actions {
                let mut step = json!({"name":a.name,"run":script(a)});
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
            json!({"stages":["build"],"build":{"stage":"build","image":"ubuntu:latest","before_script":[setup],"script":commands}})
        }
        "azure" => {
            json!({"trigger":["main"],"pool":{"vmImage":"ubuntu-latest"},"steps":[{"script":format!("{setup}\n{}",commands.join("\n")),"displayName":"FluentCI"}]})
        }
        "circleci" => {
            json!({"version":2.1,"jobs":{"build":{"machine":{"image":"ubuntu-2204:current"},"steps":["checkout",{"run":setup},{"run":commands.join("\n")}] }},"workflows":{"ci":{"jobs":["build"]}}})
        }
        "aws" => {
            json!({"version":0.2,"phases":{"install":{"commands":[setup]},"build":{"commands":commands}}})
        }
        _ => bail!("Unknown CI provider {provider:?}"),
    };
    Ok(serde_yaml::to_string(&value)?)
}
