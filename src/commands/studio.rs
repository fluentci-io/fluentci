use crate::{db::Db, detection, models::Project, server, workspace::Workspace};
use anyhow::Result;
use std::path::Path;

pub(super) async fn execute(db: Db, port: u16) -> Result<()> {
    let path = Workspace::current()?.root.to_string_lossy().into_owned();
    if db.project(&path).await?.is_none() {
        let project = Project::new(path);
        db.save_project(&project).await?;
        db.save_actions(&project.id, &detection::actions(Path::new(&project.path))?)
            .await?;
    }
    server::serve(db, port, true).await
}
