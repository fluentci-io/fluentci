use crate::{models::WorkflowFilter, workflows::Definition};
use anyhow::{Result, ensure};
use serde_json::{Value, json};

// Inclusive globs are restricted at validation, making this translation lossless.
fn glob(pattern: &str) -> String {
    let mut output = String::from("^");
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                if chars.peek() == Some(&'/') {
                    chars.next();
                    output.push_str("(?:.*/)?");
                } else {
                    output.push_str(".*");
                }
            }
            '*' => output.push_str("[^/]*"),
            '?' => output.push_str("[^/]"),
            '.' | '(' | ')' | '|' | '^' | '$' | '\\' | '/' => {
                output.push('\\');
                output.push(c);
            }
            c => output.push(c),
        }
    }
    output.push('$');
    output
}

fn pattern_expression(variable: &str, patterns: &[String]) -> String {
    if patterns.is_empty() {
        return String::new();
    }
    format!(
        " && ({})",
        patterns
            .iter()
            .map(|p| format!("{variable} =~ /{}/", glob(p)))
            .collect::<Vec<_>>()
            .join(" || ")
    )
}

fn gitlab_rule(source: &str, variable: &str, patterns: &[String], paths: &[String]) -> Value {
    let mut rule = json!({"if":format!("$CI_PIPELINE_SOURCE == \"{source}\"{variable}{}", pattern_expression(if source == "merge_request_event" { "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" } else if variable.contains("TAG") { "$CI_COMMIT_TAG" } else { "$CI_COMMIT_BRANCH" }, patterns))});
    if !paths.is_empty() {
        rule["changes"] = json!({"paths":paths});
    }
    rule
}

fn azure_filter(filter: &WorkflowFilter, push: bool) -> Value {
    let mut output = json!({"branches":{"include": if filter.branches.is_empty() && (!push || filter.tags.is_empty()) {vec!["*".to_string()]} else {filter.branches.clone()}}});
    if push && filter.branches.is_empty() && !filter.tags.is_empty() {
        output["branches"] = json!({"exclude":["*"]});
    }
    if push {
        output["tags"] = if filter.tags.is_empty() && !filter.branches.is_empty() {
            json!({"exclude":["*"]})
        } else {
            json!({"include": if filter.tags.is_empty() {vec!["*".into()]} else {filter.tags.clone()}})
        };
    }
    if !filter.paths.is_empty() {
        output["paths"] = json!({"include":filter.paths});
    }
    output
}

fn circle_patterns(value: &str, patterns: &[String]) -> Value {
    if patterns.is_empty() {
        return json!(true);
    }
    json!({"or":patterns.iter().map(|p| json!({"matches":{"pattern":glob(p),"value":format!("<< {value} >>")}})).collect::<Vec<_>>()})
}

pub(super) fn apply(
    provider: &str,
    definition: &Definition,
    config: &mut Value,
) -> Result<Vec<String>> {
    let events = &definition.events;
    let mut notes =
        vec!["Event triggers apply to CI only. Local workflow runs are always manual.".into()];
    match provider {
        "github" => {
            config["name"] = json!(definition.name);
            let mut on = json!({});
            if let Some(filter) = &events.push {
                on["push"] = serde_json::to_value(filter)?;
            }
            if let Some(filter) = &events.pull_request {
                on["pull_request"] = serde_json::to_value(filter)?;
            }
            if events.manual {
                on["workflow_dispatch"] = json!({});
            }
            if !events.schedule.is_empty() {
                on["schedule"] = json!(
                    events
                        .schedule
                        .iter()
                        .map(|cron| json!({"cron":cron}))
                        .collect::<Vec<_>>()
                );
            }
            ensure!(
                !on.as_object().unwrap().is_empty(),
                "No CI events configured. Enable manual dispatch or an event before exporting to GitHub Actions."
            );
            config["on"] = on;
        }
        "gitlab" => {
            let mut rules = vec![];
            if let Some(filter) = &events.push {
                if !filter.branches.is_empty() || filter.tags.is_empty() {
                    rules.push(gitlab_rule(
                        "push",
                        " && $CI_COMMIT_BRANCH",
                        &filter.branches,
                        &filter.paths,
                    ));
                }
                if !filter.tags.is_empty() || filter.branches.is_empty() {
                    rules.push(gitlab_rule("push", " && $CI_COMMIT_TAG", &filter.tags, &[]));
                }
            }
            if let Some(filter) = &events.pull_request {
                rules.push(gitlab_rule(
                    "merge_request_event",
                    "",
                    &filter.branches,
                    &filter.paths,
                ));
            }
            if events.manual {
                rules.push(json!({"if":"$CI_PIPELINE_SOURCE == \"web\" || $CI_PIPELINE_SOURCE == \"api\" || $CI_PIPELINE_SOURCE == \"trigger\""}));
            }
            if !events.schedule.is_empty() {
                rules.push(json!({"if":"$CI_PIPELINE_SOURCE == \"schedule\""}));
                notes.push(format!("Create these UTC schedules in GitLab CI/CD > Schedules (cron is configured outside YAML): {}", events.schedule.join("; ")));
            }
            rules.push(json!({"when":"never"}));
            config["workflow"] = json!({"name":definition.name,"rules":rules});
            // Explicit job rules are necessary for merge-request pipelines too.
            config["build"]["rules"] = json!([{"when":"on_success"}]);
        }
        "azure" => {
            config["trigger"] = events
                .push
                .as_ref()
                .map(|filter| azure_filter(filter, true))
                .unwrap_or(json!("none"));
            config["pr"] = events
                .pull_request
                .as_ref()
                .map(|filter| azure_filter(filter, false))
                .unwrap_or(json!("none"));
            if events.pull_request.is_some() {
                notes.push("Azure YAML PR triggers require a GitHub or Bitbucket repository. Azure Repos uses build-validation branch policies.".into());
            }
            if !events.schedule.is_empty() {
                let branches = events
                    .push
                    .as_ref()
                    .map(|p| p.branches.clone())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| vec!["main".into()]);
                config["schedules"] = json!(events.schedule.iter().map(|cron| json!({"cron":cron,"displayName":definition.name,"branches":{"include":branches},"always":true})).collect::<Vec<_>>());
            }
            notes.push("Azure manual runs are managed by pipeline permissions; YAML cannot disable the Run pipeline button.".into());
        }
        "circleci" => {
            ensure!(
                events
                    .push
                    .iter()
                    .chain(events.pull_request.iter())
                    .all(|f| f.paths.is_empty()),
                "CircleCI cannot express path filters in a static workflow. Use GitHub/GitLab/Azure export, or configure CircleCI dynamic path filtering explicitly."
            );
            let mut conditions = vec![];
            if let Some(filter) = &events.push {
                let mut refs = vec![];
                if !filter.branches.is_empty() || filter.tags.is_empty() {
                    refs.push(json!({"matches":{"pattern":format!("^refs/heads/{}", if filter.branches.is_empty() { ".*".into() } else {format!("(?:{})",filter.branches.iter().map(|p|glob(p).trim_start_matches('^').to_string()).collect::<Vec<_>>().join("|"))}),"value":"<< pipeline.event.github.ref >>"}}));
                }
                if !filter.tags.is_empty() || filter.branches.is_empty() {
                    refs.push(json!({"matches":{"pattern":format!("^refs/tags/{}", if filter.tags.is_empty() { ".*".into() } else {format!("(?:{})",filter.tags.iter().map(|p|glob(p).trim_start_matches('^').to_string()).collect::<Vec<_>>().join("|"))}),"value":"<< pipeline.event.github.ref >>"}}));
                }
                conditions.push(
                    json!({"and":[{"equal":["push","<< pipeline.event.name >>"]},{"or":refs}]}),
                );
            }
            if let Some(filter) = &events.pull_request {
                conditions.push(json!({"and":[{"equal":["pull_request","<< pipeline.event.name >>"]},circle_patterns("pipeline.event.github.pull_request.base.ref", &filter.branches)]}));
            }
            if events.manual {
                conditions.push(json!({"equal":["api","<< pipeline.event.name >>"]}));
            }
            if !events.schedule.is_empty() {
                conditions
                    .push(json!({"equal":["scheduled_pipeline","<< pipeline.trigger_source >>"]}));
                notes.push(format!("Create these UTC schedules using CircleCI schedule triggers (outside this YAML): {}",events.schedule.join("; ")));
            }
            config["workflows"] = json!({definition.id.clone():{"when": if conditions.is_empty(){json!(false)}else{json!({"or":conditions})},"jobs":[{"build":{"filters":{"tags":{"only":"/.*/"}}}}]}});
            notes.push("Requires CircleCI's GitHub App integration. Enable the matching push/PR triggers in project settings; pipeline.event.* values are integration-specific.".into());
        }
        "semaphore" => {
            ensure!(
                events
                    .push
                    .iter()
                    .chain(events.pull_request.iter())
                    .all(|f| f.paths.is_empty()),
                "Semaphore path filters require project-specific change detection. Remove path filters or use GitHub/GitLab/Azure export."
            );
            let matches = |variable: &str, patterns: &[String]| -> Result<String> {
                if patterns.is_empty() {
                    return Ok("true".into());
                }
                Ok(format!(
                    "( {} )",
                    patterns
                        .iter()
                        .map(|pattern| {
                            Ok(format!(
                                "fluentci_matches \"${{{variable}:-}}\" {}",
                                shlex::try_quote(&glob(pattern))?
                            ))
                        })
                        .collect::<Result<Vec<_>>>()?
                        .join(" || ")
                ))
            };
            let mut conditions = vec![];
            if let Some(filter) = &events.push {
                for (kind, variable, patterns, enabled) in [
                    (
                        "branch",
                        "SEMAPHORE_GIT_BRANCH",
                        &filter.branches,
                        !filter.branches.is_empty() || filter.tags.is_empty(),
                    ),
                    (
                        "tag",
                        "SEMAPHORE_GIT_TAG_NAME",
                        &filter.tags,
                        !filter.tags.is_empty() || filter.branches.is_empty(),
                    ),
                ] {
                    if enabled {
                        conditions.push(format!("( [[ \"${{SEMAPHORE_WORKFLOW_TRIGGERED_BY_HOOK:-}}\" == true && \"${{SEMAPHORE_GIT_REF_TYPE:-}}\" == {kind} ]] && {} )",matches(variable, patterns)?));
                    }
                }
            }
            if let Some(filter) = &events.pull_request {
                conditions.push(format!("( [[ \"${{SEMAPHORE_WORKFLOW_TRIGGERED_BY_HOOK:-}}\" == true && \"${{SEMAPHORE_GIT_REF_TYPE:-}}\" == pull-request ]] && {} )",matches("SEMAPHORE_GIT_BRANCH", &filter.branches)?));
            }
            if events.manual {
                conditions.push("[[ \"${SEMAPHORE_WORKFLOW_TRIGGERED_BY_API:-}\" == true || \"${SEMAPHORE_WORKFLOW_TRIGGERED_BY_MANUAL_RUN:-}\" == true ]]".into());
            }
            if !events.schedule.is_empty() {
                conditions
                    .push("[[ \"${SEMAPHORE_WORKFLOW_TRIGGERED_BY_SCHEDULE:-}\" == true ]]".into());
                notes.push(format!(
                    "Create Semaphore scheduled Tasks with these UTC cron expressions: {}",
                    events.schedule.join("; ")
                ));
            }
            let commands = config["blocks"][0]["task"]["jobs"][0]["commands"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap())
                .collect::<Vec<_>>()
                .join("\n");
            let condition = if conditions.is_empty() {
                "false".into()
            } else {
                conditions.join(" || ")
            };
            config["name"] = json!(definition.name);
            config["blocks"][0]["task"]["jobs"][0]["commands"] = json!([format!(
                "set -e\nfluentci_matches() {{ local pattern=\"$2\"; [[ \"$1\" =~ $pattern ]]; }}\nif {condition}; then\n{commands}\nelse\necho 'No matching FluentCI workflow event; skipping steps.'\nfi"
            )]);
            notes.push("Enable the selected branch/tag/pull-request events in Semaphore project settings. The job checks event and target-ref filters before executing steps. Unmatched events complete without running steps.".into());
        }
        "aws" => {
            let mut groups = vec![];
            for (event, filter) in
                events
                    .push
                    .iter()
                    .map(|f| ("PUSH", f))
                    .chain(events.pull_request.iter().map(|f| {
                        (
                            "PULL_REQUEST_CREATED, PULL_REQUEST_UPDATED, PULL_REQUEST_REOPENED",
                            f,
                        )
                    }))
            {
                let mut refs = vec![];
                if event == "PUSH" {
                    if !filter.branches.is_empty() || filter.tags.is_empty() {
                        refs.push(("HEAD_REF", "refs/heads/", &filter.branches, true));
                    }
                    if !filter.tags.is_empty() || filter.branches.is_empty() {
                        refs.push(("HEAD_REF", "refs/tags/", &filter.tags, false));
                    }
                } else {
                    refs.push(("BASE_REF", "refs/heads/", &filter.branches, true));
                }
                for (kind, prefix, patterns, use_paths) in refs {
                    let patterns = if patterns.is_empty() {
                        vec!["**".into()]
                    } else {
                        patterns.clone()
                    };
                    let pattern = patterns
                        .iter()
                        .map(|p| glob(&format!("{prefix}{p}")))
                        .collect::<Vec<_>>()
                        .join("|");
                    let mut group = vec![
                        json!({"type":"EVENT","pattern":event}),
                        json!({"type":kind,"pattern":pattern}),
                    ];
                    if use_paths && !filter.paths.is_empty() {
                        group.push(json!({"type":"FILE_PATH","pattern":filter.paths.iter().map(|p|glob(p)).collect::<Vec<_>>().join("|")}));
                    }
                    groups.push(group);
                }
            }
            if groups.is_empty() {
                notes.push("No webhook events selected. Disable/delete existing CodeBuild webhooks; do not create a webhook with empty filters (that would enable all push events).".into());
            } else {
                notes.push("AWS CodeBuild webhook triggers live on the project, outside buildspec.yml. Apply this CreateWebhook/UpdateWebhook payload with your project name:".into());
                notes.push(serde_json::to_string_pretty(
                    &json!({"projectName":"REPLACE_WITH_PROJECT_NAME","filterGroups":groups}),
                )?);
            }
            if !events.schedule.is_empty() {
                notes.push(format!("Configure EventBridge Scheduler to start this CodeBuild project at these UTC cron times: {}",events.schedule.join("; ")));
            }
            notes.push(format!(
                "Manual CI dispatch requested: {}. Control CodeBuild StartBuild access with IAM.",
                events.manual
            ));
        }
        _ => unreachable!("provider validated before applying events"),
    }
    Ok(notes)
}
