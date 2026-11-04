//! Serializable workflow policy. Builders are pure; publication runs on owned workers.
use crate::{cache, Cancellation, Status, Task, TaskResult};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Condition {
    #[default]
    Success,
    Failure,
    Always,
    Never,
}
impl Condition {
    pub fn finalizer(self) -> bool {
        matches!(self, Self::Always | Self::Failure)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Retry {
    pub max_attempts: u32,
    pub delay_ms: u64,
    pub max_delay_ms: u64,
    #[serde(default)]
    pub exit_codes: Vec<i32>,
}
impl Retry {
    pub fn delay(&self, completed: usize) -> u64 {
        self.delay_ms
            .saturating_mul(1u64 << completed.saturating_sub(1).min(31))
            .min(self.max_delay_ms)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct OutputRef {
    pub task: String,
    pub name: String,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Policy {
    pub when: Condition,
    pub retry: Option<Retry>,
    pub allow_failure: bool,
    pub outputs: BTreeMap<String, PathBuf>,
    pub artifacts: BTreeMap<String, PathBuf>,
    pub bindings: BTreeMap<String, OutputRef>,
}
impl Policy {
    pub fn is_default(&self) -> bool {
        self == &Self::default()
    }
    pub fn products(&self) -> bool {
        !self.outputs.is_empty() || !self.artifacts.is_empty()
    }
    pub fn validate(&self, task: &Task) -> Result<(), String> {
        if let Some(retry) = &self.retry {
            if retry.max_attempts == 0
                || retry.max_attempts > 100
                || retry.delay_ms == 0
                || retry.delay_ms > retry.max_delay_ms
                || retry.max_delay_ms > 60_000
            {
                return Err(
                    "retry requires 1..100 attempts and 0 < delay_ms <= max_delay_ms <= 60000"
                        .into(),
                );
            }
        }
        if self.when.finalizer()
            && (task.timeout_ms.is_none() || task.resource_wait_timeout_ms.is_none())
        {
            return Err("always/failure tasks require task and resource-wait timeouts".into());
        }
        if task.service.is_some()
            && (self.retry.is_some()
                || self.when != Condition::Success
                || self.allow_failure
                || self.products())
        {
            return Err(
                "services cannot use retry, conditional execution, allowed failure or products"
                    .into(),
            );
        }
        if task.cache.is_some() && self.when.finalizer() {
            return Err("finalizers cannot be action cached".into());
        }
        for (name, path) in self.outputs.iter().chain(&self.artifacts) {
            if !valid_name(name) || !cache::safe_relative(path) {
                return Err("products require safe names and contained relative paths".into());
            }
            if let Some(policy) = &task.cache {
                if !policy.outputs.iter().any(|output| path.starts_with(output)) {
                    return Err("cached task products must be covered by cache outputs".into());
                }
            }
        }
        for (key, reference) in &self.bindings {
            if key.is_empty() || key.contains(['=', '\0']) || !valid_name(&reference.name) {
                return Err("invalid output binding".into());
            }
        }
        Ok(())
    }
}
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        && name != "."
        && name != ".."
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Attempt {
    pub number: usize,
    pub status: Status,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Artifact {
    pub path: PathBuf,
    pub size: u64,
    pub sha256: String,
}
#[derive(Default)]
pub(crate) struct Products {
    pub outputs: BTreeMap<String, String>,
    pub artifacts: BTreeMap<String, Artifact>,
}
pub(crate) enum Gate {
    Wait,
    Skip,
    Ready,
}
pub(crate) fn gate(task: &Task, parents: &[usize], results: &[TaskResult], tasks: &[Task]) -> Gate {
    if parents.iter().any(|&p| {
        !results[p].status.terminal()
            && results[p].status != Status::Ready
            && !(task.policy.when.finalizer() && results[p].status == Status::Stopping)
    }) {
        return Gate::Wait;
    }
    let blocked = parents.iter().any(|&p| !satisfied(&results[p], &tasks[p]));
    let failed = parents
        .iter()
        .any(|&p| !satisfied(&results[p], &tasks[p]) && !results[p].condition_skipped);
    match task.policy.when {
        Condition::Always => Gate::Ready,
        Condition::Failure if failed => Gate::Ready,
        Condition::Success if !blocked => Gate::Ready,
        _ => Gate::Skip,
    }
}
pub(crate) fn satisfied(result: &TaskResult, task: &Task) -> bool {
    matches!(result.status, Status::Succeeded | Status::Ready)
        || (task.policy.allow_failure && matches!(result.status, Status::Failed | Status::TimedOut))
}
pub(crate) fn resolve(task: &Task, results: &[TaskResult]) -> Result<Task, String> {
    let mut task = task.clone();
    for (key, reference) in &task.policy.bindings {
        let value = results
            .iter()
            .find(|r| r.id == reference.task)
            .and_then(|r| r.outputs.get(&reference.name))
            .ok_or_else(|| format!("missing output {}.{}", reference.task, reference.name))?;
        if value.contains('\0') {
            return Err("output environment values must not contain NUL".into());
        }
        task.env.insert(key.clone(), value.clone());
    }
    Ok(task)
}
/// Copy only regular files, verify their content/mode before and after copying,
/// and atomically expose the completed task's named artifact directory.
pub(crate) fn collect(
    task: &Task,
    run: &Path,
    index: usize,
    cancel: &Cancellation,
) -> Result<Products, String> {
    let mut products = Products::default();
    for (name, relative) in &task.policy.outputs {
        if cancel.is_cancelled() {
            return Err("product publication cancelled".into());
        }
        let path = cache::checked_path(&task.cwd, relative)?;
        let mut file = cache::open_storage_file(&path).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        (&mut file)
            .take(65_537)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 65_536 {
            return Err("task output exceeds 64 KiB".into());
        }
        products.outputs.insert(
            name.clone(),
            String::from_utf8(bytes).map_err(|_| "task outputs must be UTF-8")?,
        );
    }
    if task.policy.artifacts.is_empty() {
        return Ok(products);
    }
    let root = run.join("artifacts");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let staging = tempfile::Builder::new()
        .prefix(".publish-")
        .tempdir_in(&root)
        .map_err(|e| e.to_string())?;
    let destination = root.join(index.to_string());
    for (name, relative) in &task.policy.artifacts {
        let before = cache::snapshot(&task.cwd, std::slice::from_ref(relative), cancel)?;
        if before.len() != 1 || before[0].directory {
            return Err(
                "named artifacts must be regular files; archive directories explicitly".into(),
            );
        }
        let source = cache::checked_path(&task.cwd, relative)?;
        cache::copy_file(&source, &staging.path().join(name), cancel)?;
        if before != cache::snapshot(&task.cwd, std::slice::from_ref(relative), cancel)? {
            return Err("artifact changed during publication".into());
        }
        fs::File::open(staging.path().join(name))
            .and_then(|file| file.sync_all())
            .map_err(|e| e.to_string())?;
        let copied = cache::snapshot(staging.path(), &[PathBuf::from(name)], cancel)?;
        if copied[0].digest != before[0].digest || copied[0].mode != before[0].mode {
            return Err("artifact copy verification failed".into());
        }
        products.artifacts.insert(
            name.clone(),
            Artifact {
                path: destination.join(name),
                size: fs::metadata(staging.path().join(name))
                    .map_err(|e| e.to_string())?
                    .len(),
                sha256: copied[0].digest.clone().unwrap(),
            },
        );
    }
    #[cfg(unix)]
    fs::File::open(staging.path())
        .and_then(|directory| directory.sync_all())
        .map_err(|e| e.to_string())?;
    fs::rename(staging.path(), &destination).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    fs::File::open(&root)
        .and_then(|directory| directory.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(products)
}

/// Open only a contained, published regular artifact. Consumers must verify the
/// advertised SHA-256 when downloading chunks from a remote run server.
pub fn artifact_file(run: &Path, index: usize, name: &str) -> std::io::Result<fs::File> {
    if !valid_name(name) || index >= 10_000 {
        return Err(std::io::ErrorKind::NotFound.into());
    }
    let relative = PathBuf::from("artifacts")
        .join(index.to_string())
        .join(name);
    let path = cache::checked_path(run, &relative)
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::NotFound))?;
    cache::open_storage_file(&path)
}
