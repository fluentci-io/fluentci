//! Small value-producing functions for functional pipeline composition.
//! Construction performs no filesystem, environment, provisioning or process IO.
//! `run` is the effect boundary; it uses the same kernel as CLI and legacy adapters.
pub use crate::matrix::{after, axis, exclude, include, matrix, named, parallel, product, Case};

use crate::{cache::CachePolicy, service::Service, Cancellation, Plan, RunResult, Task};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

pub fn exec(
    id: impl Into<String>,
    program: impl Into<String>,
    args: Vec<String>,
    cwd: impl Into<PathBuf>,
) -> Task {
    Task {
        id: id.into(),
        program: program.into(),
        args,
        cwd: cwd.into(),
        env: BTreeMap::new(),
        needs: vec![],
        resources: vec![],
        shared_resources: vec![],
        package_install: None,
        file_operation: None,
        primitive: None,
        env_files: vec![],
        package_environment: vec![],
        resource_wait_timeout_ms: None,
        timeout_ms: None,
        cache: None,
        service: None,
        policy: Default::default(),
    }
}
pub fn env(mut task: Task, values: BTreeMap<String, String>) -> Task {
    task.env.extend(values);
    task
}
pub fn needs(mut task: Task, dependencies: Vec<String>) -> Task {
    task.needs = dependencies;
    task
}
pub fn cache(mut task: Task, policy: CachePolicy) -> Task {
    task.cache = Some(policy);
    task
}
pub fn service(mut task: Task, lifecycle: Service) -> Task {
    task.service = Some(lifecycle);
    task
}
pub fn timeout(mut task: Task, milliseconds: u64) -> Task {
    task.timeout_ms = Some(milliseconds);
    task
}
pub fn resources(mut task: Task, names: Vec<String>) -> Task {
    task.resources = names;
    task
}
pub fn plan(tasks: Vec<Task>) -> Plan {
    Plan {
        version: 1,
        tasks,
        jobs: 1,
        max_services: 8,
        fail_fast: true,
        inherit_env: false,
        workspace: None,
        cache_dir: None,
        resource_dir: None,
    }
}
pub fn jobs(mut plan: Plan, concurrency: usize) -> Plan {
    plan.jobs = concurrency;
    plan
}
pub fn fail_fast(mut plan: Plan, enabled: bool) -> Plan {
    plan.fail_fast = enabled;
    plan
}
pub fn run(
    plan: &Plan,
    directory: &Path,
    cancellation: &Cancellation,
) -> Result<RunResult, String> {
    plan.execute(directory, cancellation)
}

/// Opt-in retries count the initial execution as attempt one. Nonzero exits only.
pub fn retry(mut task: Task, max_attempts: u32, delay_ms: u64) -> Task {
    task.policy.retry = Some(crate::workflow::Retry {
        max_attempts,
        delay_ms,
        max_delay_ms: 60_000,
        exit_codes: vec![],
    });
    task
}
pub fn when(mut task: Task, condition: crate::workflow::Condition) -> Task {
    task.policy.when = condition;
    if condition.finalizer() {
        task.timeout_ms.get_or_insert(30_000);
        task.resource_wait_timeout_ms.get_or_insert(30_000);
    }
    task
}
pub fn always(task: Task) -> Task {
    when(task, crate::workflow::Condition::Always)
}
pub fn allow_failure(mut task: Task, enabled: bool) -> Task {
    task.policy.allow_failure = enabled;
    task
}
pub fn artifact(mut task: Task, name: impl Into<String>, path: impl Into<PathBuf>) -> Task {
    task.policy.artifacts.insert(name.into(), path.into());
    task
}
pub fn output(mut task: Task, name: impl Into<String>, path: impl Into<PathBuf>) -> Task {
    task.policy.outputs.insert(name.into(), path.into());
    task
}
pub fn output_env(
    mut task: Task,
    key: impl Into<String>,
    producer: &Task,
    name: impl Into<String>,
) -> Task {
    if !task.needs.contains(&producer.id) {
        task.needs.push(producer.id.clone());
    }
    task.policy.bindings.insert(
        key.into(),
        crate::workflow::OutputRef {
            task: producer.id.clone(),
            name: name.into(),
        },
    );
    task
}
pub fn resource(mut task: Task, name: impl Into<String>) -> Task {
    let name = name.into();
    if !task.resources.contains(&name) {
        task.resources.push(name);
    }
    task
}

/// Construct a native file task without performing IO.
pub fn file_task(
    id: impl Into<String>,
    operation: crate::files::Operation,
    cwd: impl Into<PathBuf>,
) -> Task {
    let mut task = exec(id, "", vec![], cwd);
    task.file_operation = Some(operation);
    task
}
pub fn env_file(mut task: Task, path: impl Into<PathBuf>) -> Task {
    task.env_files.push(path.into());
    task
}
pub fn read_text(
    id: impl Into<String>,
    path: PathBuf,
    limit_bytes: u64,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::ReadText { path, limit_bytes },
        cwd,
    )
}
pub fn read_bytes(
    id: impl Into<String>,
    path: PathBuf,
    limit_bytes: u64,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::ReadBytes { path, limit_bytes },
        cwd,
    )
}
pub fn write_text(
    id: impl Into<String>,
    path: PathBuf,
    text: String,
    overwrite: bool,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::WriteText {
            path,
            text,
            overwrite,
        },
        cwd,
    )
}
pub fn write_bytes(
    id: impl Into<String>,
    path: PathBuf,
    bytes: Vec<u8>,
    overwrite: bool,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::WriteBytes {
            path,
            bytes,
            overwrite,
        },
        cwd,
    )
}
pub fn copy_file(
    id: impl Into<String>,
    source: PathBuf,
    destination: PathBuf,
    overwrite: bool,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::CopyFile {
            source,
            destination,
            overwrite,
        },
        cwd,
    )
}
pub fn copy_tree(
    id: impl Into<String>,
    source: PathBuf,
    destination: PathBuf,
    overwrite: bool,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::CopyTree {
            source,
            destination,
            overwrite,
        },
        cwd,
    )
}
pub fn move_path(
    id: impl Into<String>,
    source: PathBuf,
    destination: PathBuf,
    overwrite: bool,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::Move {
            source,
            destination,
            overwrite,
        },
        cwd,
    )
}
pub fn mkdir(id: impl Into<String>, path: PathBuf, parents: bool, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::Mkdir { path, parents }, cwd)
}
pub fn remove(
    id: impl Into<String>,
    path: PathBuf,
    recursive: bool,
    missing_ok: bool,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(
        id,
        crate::files::Operation::Remove {
            path,
            recursive,
            missing_ok,
        },
        cwd,
    )
}
pub fn stat(id: impl Into<String>, path: PathBuf, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::Stat { path }, cwd)
}
pub fn exists(id: impl Into<String>, path: PathBuf, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::Exists { path }, cwd)
}
pub fn list(id: impl Into<String>, path: PathBuf, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::List { path }, cwd)
}
pub fn glob(id: impl Into<String>, pattern: String, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::Glob { pattern }, cwd)
}
pub fn hash(id: impl Into<String>, path: PathBuf, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::Hash { path }, cwd)
}
pub fn chmod(id: impl Into<String>, path: PathBuf, mode: u32, cwd: impl Into<PathBuf>) -> Task {
    file_task(id, crate::files::Operation::Chmod { path, mode }, cwd)
}
pub fn symlink(
    id: impl Into<String>,
    target: PathBuf,
    path: PathBuf,
    cwd: impl Into<PathBuf>,
) -> Task {
    file_task(id, crate::files::Operation::Symlink { target, path }, cwd)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn composition_preserves_argv_and_has_no_ambient_environment_or_effects() {
        let original = exec(
            "compile",
            "/tool/not-installed",
            vec![
                "one argument with spaces".into(),
                "$(do-not-execute)".into(),
            ],
            "/workspace/not-created",
        );
        let configured = env(
            timeout(needs(original.clone(), vec!["fetch".into()]), 2_000),
            BTreeMap::from([("MODE".into(), "release".into())]),
        );
        let pipeline = jobs(plan(vec![configured]), 4);
        assert_eq!(pipeline.tasks[0].args, original.args);
        assert!(original.needs.is_empty());
        assert!(original.env.is_empty());
        assert_eq!(pipeline.tasks[0].needs, vec!["fetch"]);
        assert!(!pipeline.inherit_env);
        assert_eq!(pipeline.jobs, 4);
    }
}
