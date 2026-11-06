use crate::{db::Db, models::Project, workflows, workspace::Workspace};
use anyhow::Result;

pub(super) async fn execute(
    db: &Db,
    workflow_id: Option<&str>,
    json: bool,
    steps: bool,
) -> Result<()> {
    let root = Workspace::current()?.root;
    let path = root.to_string_lossy().into_owned();
    // Listing is read-only and also works before a project has been opened in Studio.
    let project = db
        .project(&path)
        .await?
        .unwrap_or_else(|| Project::new(path));
    let mut items = workflows::list(db, &project).await?;
    if let Some(key) = workflow_id {
        workflows::validate_id(key)?;
        items.retain(|workflow| workflow.id == key);
        anyhow::ensure!(!items.is_empty(), "Workflow {key:?} not found");
    }
    if json {
        let mut output = Vec::with_capacity(items.len());
        for workflow in items {
            let mut value = serde_json::to_value(&workflow)?;
            if steps {
                let definition = workflows::definition(db, &project, &workflow.id).await?;
                value["steps"] = serde_json::to_value(definition.actions()?)?;
            }
            output.push(value);
        }
        println!("{}", serde_json::to_string_pretty(&output)?);
    } else {
        println!(
            "{:<20} {:<32} {:<10} {:>5}  FILE",
            "ID", "NAME", "STATE", "STEPS"
        );
        for workflow in items {
            println!(
                "{:<20} {:<32} {:<10} {:>5}  {}",
                workflow.id,
                workflow.name,
                if workflow.enabled {
                    "enabled"
                } else {
                    "disabled"
                },
                workflow.step_count,
                workflow
                    .path
                    .as_deref()
                    .unwrap_or("default project actions")
            );
            if steps {
                let definition = workflows::definition(db, &project, &workflow.id).await?;
                if !definition.env.is_empty() {
                    println!("  Workflow environment: {}", definition.env.join(", "));
                }
                let actions = definition.actions()?;
                if actions.is_empty() {
                    println!("  No steps configured.");
                }
                for (index, action) in actions.iter().enumerate() {
                    println!(
                        "  {}. {} [{}]",
                        index + 1,
                        action.name,
                        if action.enabled {
                            "enabled"
                        } else {
                            "disabled"
                        }
                    );
                    println!(
                        "     Module: {} | Wasm: {} | Directory: {}",
                        action.plugin,
                        action.use_wasm,
                        action.working_directory.as_deref().unwrap_or(".")
                    );
                    for command in action.commands.lines() {
                        println!("     Command: {command}");
                    }
                    for entry in action.env.iter().flatten() {
                        println!("     Environment: {entry}");
                    }
                }
                println!();
            }
        }
    }
    Ok(())
}
