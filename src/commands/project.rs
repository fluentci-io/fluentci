use crate::{cli::ProjectCommand, db::Db, models::Project, workspace::Workspace};
use anyhow::{Context, Result};

pub(super) async fn execute(db: &Db, command: ProjectCommand) -> Result<()> {
    match command {
        ProjectCommand::Create => {
            let p = Project::new("empty".into());
            db.save_project(&p).await?;
            println!(
                "Project {} created. Run FLUENTCI_PROJECT_ID={} fluentci run . to finish setup",
                p.name, p.name
            );
        }
        ProjectCommand::List => {
            println!("NAME\tPATH\tCREATED");
            for p in db.projects().await? {
                println!("{}\t{}\t{}", p.name, p.path, p.created_at);
            }
        }
        ProjectCommand::Show { name } => {
            let p = db.project(&name).await?.context("Project not found")?;
            println!("{}", serde_json::to_string_pretty(&p)?);
        }
        ProjectCommand::Export {
            name,
            workflow,
            azure,
            gitlab,
            circleci,
            semaphore,
            aws,
            ..
        } => {
            let key = name.unwrap_or(Workspace::current()?.root.to_string_lossy().into());
            let p = db.project(&key).await?.context("Project not found")?;
            let provider = if azure {
                "azure"
            } else if gitlab {
                "gitlab"
            } else if circleci {
                "circleci"
            } else if semaphore {
                "semaphore"
            } else if aws {
                "aws"
            } else {
                "github"
            };
            print!(
                "{}",
                crate::export::generate_workflow(
                    provider,
                    &crate::workflows::definition(db, &p, &workflow).await?
                )?
            );
        }
    }
    Ok(())
}
