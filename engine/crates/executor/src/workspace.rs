//! Declared source copies for run-local filesystem separation, not an OS sandbox.
use crate::{cache, graph::DependencyGraph, Cancellation, Plan, RunResult};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Workspace {
    pub source: PathBuf,
    pub inputs: Vec<PathBuf>,
}
impl Workspace {
    fn source(&self) -> Result<PathBuf, String> {
        if !self.source.is_absolute() || !self.source.is_dir() {
            return Err("workspace source must be an existing absolute directory".into());
        }
        let source = fs::canonicalize(&self.source).map_err(|e| e.to_string())?;
        for (index, input) in self.inputs.iter().enumerate() {
            if !cache::safe_relative(input) {
                return Err("workspace inputs must be relative paths without '.' or '..'".into());
            }
            if self.inputs[..index]
                .iter()
                .any(|other| input.starts_with(other) || other.starts_with(input))
            {
                return Err("workspace input roots must not overlap".into());
            }
            let path = cache::checked_path(&source, input)?;
            if !path.exists() {
                return Err(format!(
                    "workspace input does not exist: {}",
                    input.display()
                ));
            }
        }
        Ok(source)
    }
    fn project(&self, plan: &Plan, root: &Path) -> Result<Plan, String> {
        let mut mapped = plan.clone();
        mapped.workspace = None;
        for task in &mut mapped.tasks {
            if task.cwd != Path::new(".") && !cache::safe_relative(&task.cwd) {
                return Err(format!("task {} needs a workspace-relative cwd", task.id));
            }
            task.cwd = if task.cwd == Path::new(".") {
                root.into()
            } else {
                cache::checked_path(root, &task.cwd)?
            };
        }
        Ok(mapped)
    }
    pub(crate) fn validate(&self, plan: &Plan) -> Result<DependencyGraph, String> {
        self.project(plan, &self.source()?)?.validate()
    }
    pub(crate) fn execute(
        &self,
        plan: &Plan,
        run_dir: &Path,
        cancel: &Cancellation,
    ) -> Result<RunResult, String> {
        if cancel.is_cancelled() {
            return Err("workspace setup cancelled".into());
        }
        self.validate(plan)?;
        let source = self.source()?;
        let absolute_run = if run_dir.is_absolute() {
            run_dir.to_owned()
        } else {
            std::env::current_dir()
                .map_err(|e| e.to_string())?
                .join(run_dir)
        };
        let destination = cache::resolved_location(&absolute_run)?;
        for input in &self.inputs {
            let path = source.join(input);
            if destination.starts_with(&path) || path.starts_with(&destination) {
                return Err("run directory overlaps a workspace input".into());
            }
        }
        // Before creating the run, reject links/special files and capture content
        // and modes. Rechecking source and destination detects copy-time changes.
        let before = cache::snapshot_with_jobs(&source, &self.inputs, cancel, plan.jobs)?;
        let mut directory = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            directory.mode(0o700);
        }
        directory
            .create(run_dir)
            .map_err(|e| format!("create run directory: {e}"))?;
        let run_dir = fs::canonicalize(run_dir).map_err(|e| e.to_string())?;
        let materialized = (|| {
            let staging = tempfile::Builder::new()
                .prefix(".workspace-")
                .tempdir_in(&run_dir)
                .map_err(|e| e.to_string())?;
            for entry in &before {
                if cancel.is_cancelled() {
                    return Err("workspace setup cancelled".into());
                }
                let target = staging.path().join(&entry.path);
                if entry.directory {
                    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                } else {
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    crate::workspace_copy::copy(
                        &cache::checked_path(&source, &entry.path)?,
                        &target,
                        cancel,
                    )?;
                }
            }
            for entry in before.iter().rev().filter(|entry| entry.directory) {
                cache::set_mode(&staging.path().join(&entry.path), entry.mode)?;
            }
            if cache::snapshot_with_jobs(staging.path(), &self.inputs, cancel, plan.jobs)? != before
                || cache::snapshot_with_jobs(&source, &self.inputs, cancel, plan.jobs)? != before
            {
                return Err("workspace inputs changed during setup".into());
            }
            if cancel.is_cancelled() {
                return Err("workspace setup cancelled".into());
            }
            let workspace = run_dir.join("workspace");
            fs::rename(staging.path(), &workspace).map_err(|e| e.to_string())?;
            let mapped = self.project(plan, &workspace)?;
            // A source directory without selected inputs becomes an empty cwd.
            for task in &mapped.tasks {
                fs::create_dir_all(&task.cwd).map_err(|e| e.to_string())?;
            }
            Ok::<_, String>(mapped)
        })();
        let mapped = match materialized {
            Ok(mapped) => mapped,
            Err(error) => {
                let _ = fs::remove_dir_all(&run_dir);
                return Err(error);
            }
        };
        if mapped.has_package_tasks() {
            mapped
                .resolve_packages()?
                .execute_resolved(&run_dir, cancel, true)
        } else {
            mapped.execute_resolved(&run_dir, cancel, true)
        }
    }
}
