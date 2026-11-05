//! Isolated, bounded host execution. Plans contain data, never a mutable "current" pipeline.
//! Filesystem access is not sandboxed: callers must declare shared writable resources.
pub mod cache;
pub mod diagnostics;
pub mod events;
pub mod files;
pub mod graph;
pub mod matrix;
pub mod packages;
pub mod primitives;
pub mod remote;
mod resources;
pub mod service;
mod telemetry;
mod worker;
pub mod workflow;
pub mod workspace;
mod workspace_copy;
use graph::DependencyGraph;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Task {
    pub id: String,
    #[serde(default)]
    pub needs: Vec<String>,
    #[serde(default)]
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_operation: Option<files::Operation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primitive: Option<remote::Operation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub env_files: Vec<PathBuf>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Exclusive resource names, e.g. "checkout:app" or "cache:cargo".
    #[serde(default)]
    pub resources: Vec<String>,
    #[serde(default)]
    pub shared_resources: Vec<String>,
    #[serde(default)]
    pub package_install: Option<packages::Install>,
    #[serde(default)]
    pub package_environment: Vec<packages::Provider>,
    #[serde(default)]
    pub resource_wait_timeout_ms: Option<u64>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub cache: Option<cache::CachePolicy>,
    #[serde(default)]
    pub service: Option<service::Service>,
    #[serde(default, skip_serializing_if = "workflow::Policy::is_default")]
    pub policy: workflow::Policy,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Plan {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<workspace::Workspace>,
    #[serde(default = "protocol_version")]
    pub version: u32,
    pub tasks: Vec<Task>,
    #[serde(default = "default_jobs")]
    pub jobs: usize,
    #[serde(default = "default_services")]
    pub max_services: usize,
    #[serde(default = "default_true")]
    pub fail_fast: bool,
    /// Disable to supply a fully explicit environment through task.env.
    #[serde(default = "default_true")]
    pub inherit_env: bool,
    #[serde(default)]
    pub cache_dir: Option<PathBuf>,
    #[serde(default)]
    pub resource_dir: Option<PathBuf>,
}
fn default_services() -> usize {
    8
}
fn protocol_version() -> u32 {
    1
}
fn default_jobs() -> usize {
    thread::available_parallelism().map_or(1, |n| n.get())
}
fn default_true() -> bool {
    true
}

#[derive(Default)]
struct CancellationState {
    cancelled: AtomicBool,
    active: std::sync::Mutex<usize>,
    idle: std::sync::Condvar,
}
#[derive(Clone, Default)]
pub struct Cancellation(Arc<CancellationState>);
struct ActiveExecution<'a>(&'a CancellationState);
impl Drop for ActiveExecution<'_> {
    fn drop(&mut self) {
        let mut active = self.0.active.lock().unwrap();
        *active -= 1;
        self.0.idle.notify_all();
    }
}
impl Cancellation {
    pub fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }
    fn enter(&self) -> ActiveExecution<'_> {
        *self.0.active.lock().unwrap() += 1;
        ActiveExecution(&self.0)
    }
    /// Wait for owned executions to finish cleanup before shutting down a host.
    /// Call `cancel` first to prevent subsequent admission from starting commands.
    pub fn wait_idle(&self, timeout: Duration) -> bool {
        let active = self.0.active.lock().unwrap();
        let (active, _) = self
            .0
            .idle
            .wait_timeout_while(active, timeout, |active| *active != 0)
            .unwrap();
        *active == 0
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Pending,
    Running,
    Ready,
    Stopping,
    Succeeded,
    Failed,
    Skipped,
    Cancelled,
    TimedOut,
}
impl Status {
    fn terminal(&self) -> bool {
        !matches!(
            self,
            Self::Pending | Self::Running | Self::Ready | Self::Stopping
        )
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TaskResult {
    pub id: String,
    pub status: Status,
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub signal: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: u128,
    pub stdout: PathBuf,
    pub stderr: PathBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probe_logs: Option<service::ProbeLogs>,
    pub cache: cache::CacheResult,
    pub wait_reason: Option<String>,
    #[serde(default)]
    pub attempts: Vec<workflow::Attempt>,
    #[serde(default)]
    pub outputs: BTreeMap<String, String>,
    #[serde(default)]
    pub artifacts: BTreeMap<String, workflow::Artifact>,
    #[serde(default)]
    pub condition_skipped: bool,
    #[serde(default)]
    pub allowed_failure: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    Succeeded,
    Failed,
    Cancelled,
}
impl RunOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}
#[derive(Debug, Deserialize, Serialize)]
pub struct RunResult {
    pub outcome: RunOutcome,
    pub tasks: Vec<TaskResult>,
}
impl RunResult {
    pub fn success(&self) -> bool {
        self.outcome == RunOutcome::Succeeded
    }
}

struct Running {
    index: usize,
    child: Option<Child>,
    native: Option<worker::Worker<()>>,
    started: Instant,
    attempt_started: Instant,
    leases: Option<resources::Leases>,
    action: Option<cache::Prepared>,
}
impl Running {
    /// Children share a dedicated Unix process group so cancellation includes subprocesses.
    fn terminate(&mut self) {
        if let Some(worker) = self.native.take() {
            worker.cancel();
            drop(worker); // Join before releasing leases or publishing completion.
        }
        if let Some(child) = &mut self.child {
            #[cfg(unix)]
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
impl Drop for Running {
    fn drop(&mut self) {
        // Also clean up background descendants when their direct parent has exited.
        self.terminate();
    }
}

struct Preparing {
    index: usize,
    started: Instant,
    worker: worker::Worker<Option<cache::Lookup>>,
    leases: Option<resources::Leases>,
    stop: Option<Status>,
}

struct Saving {
    index: usize,
    started: Instant,
    // Field order matters: join the worker before releasing its resource leases.
    worker: worker::Worker<workflow::Products>,
    cache_outcome: String,
    _leases: Option<resources::Leases>,
    stop: Option<Status>,
}

fn release_resources(
    task: &Task,
    resources: &mut HashSet<String>,
    readers: &mut HashMap<String, usize>,
) {
    for resource in &task.resources {
        resources.remove(resource);
    }
    for resource in &task.shared_resources {
        if let Some(count) = readers.get_mut(resource) {
            *count -= 1;
            if *count == 0 {
                readers.remove(resource);
            }
        }
    }
}

/// Immutable compiled native IR. JSON is produced only when explicitly requested.
pub struct CompiledPlan {
    plan: Plan,
    graph: DependencyGraph,
    ancestors: graph::Edges,
}

impl CompiledPlan {
    pub fn plan(&self) -> &Plan {
        &self.plan
    }
    pub fn graph(&self) -> &DependencyGraph {
        &self.graph
    }
    pub fn execute(&self, run_dir: &Path, cancel: &Cancellation) -> Result<RunResult, String> {
        if self.plan.workspace.is_some() {
            return self.plan.execute(run_dir, cancel);
        }
        let _active = cancel.enter();
        self.plan
            .execute_compiled_graph(run_dir, cancel, false, &self.graph, &self.ancestors)
    }
    pub fn debug_json(&self) -> Result<String, String> {
        serde_json::to_string_pretty(&self.plan).map_err(|error| error.to_string())
    }
}

impl Plan {
    pub fn compile(self) -> Result<CompiledPlan, String> {
        let plan = if self.has_package_tasks() && self.workspace.is_none() {
            self.resolve_packages()?
        } else {
            self
        };
        let (graph, ancestors) = if plan.workspace.is_some() {
            let graph = plan.validate()?;
            let ancestors = service_ancestors(&graph, &plan.tasks);
            (graph, ancestors)
        } else {
            plan.compile_graph()?
        };
        Ok(CompiledPlan {
            plan,
            graph,
            ancestors,
        })
    }
    /// Resolve declarative paths against the caller's base without filesystem IO.
    /// Workspace task directories remain relative to the materialized workspace.
    pub fn resolve_paths(&mut self, base: &Path) -> Result<(), String> {
        if !base.is_absolute() {
            return Err("plan path base must be absolute".into());
        }
        fn resolve(path: &mut PathBuf, base: &Path) -> Result<(), String> {
            if path.as_os_str().is_empty() {
                return Err("plan paths must not be empty".into());
            }
            if path.is_relative() {
                *path = base.join(&*path);
            }
            Ok(())
        }
        if let Some(path) = &mut self.cache_dir {
            resolve(path, base)?;
        }
        if let Some(path) = &mut self.resource_dir {
            resolve(path, base)?;
        }
        if let Some(workspace) = &mut self.workspace {
            resolve(&mut workspace.source, base)?;
        } else {
            for task in &mut self.tasks {
                resolve(&mut task.cwd, base)?;
            }
        }
        Ok(())
    }
    pub fn validate(&self) -> Result<DependencyGraph, String> {
        if let Some(workspace) = &self.workspace {
            return workspace.validate(self);
        }
        if self.has_package_tasks() {
            self.resolve_packages()?.validate_resolved()
        } else {
            self.validate_resolved()
        }
    }
    fn validate_resolved(&self) -> Result<DependencyGraph, String> {
        self.compile_graph().map(|(graph, _)| graph)
    }
    fn compile_graph(&self) -> Result<(DependencyGraph, graph::Edges), String> {
        if self.version != 1 {
            return Err(format!("unsupported plan version: {}", self.version));
        }
        if self.jobs == 0 || self.max_services == 0 {
            return Err("jobs must be greater than zero".into());
        }
        if self.resource_dir.as_ref().is_some_and(|p| !p.is_absolute()) {
            return Err("resource_dir must be absolute".into());
        }
        let mut checked_directories = HashSet::new();
        for task in &self.tasks {
            task.policy.validate(task)?;
            files::validate_env(task)?;
            if let Some(operation) = &task.file_operation {
                if task.primitive.is_some() {
                    return Err("a task cannot contain both file and primitive operations".into());
                }
                operation.validate(task)?;
            }
            if let Some(operation) = &task.primitive {
                operation.validate()?;
                if !task.program.is_empty()
                    || !task.args.is_empty()
                    || task.service.is_some()
                    || task.package_install.is_some()
                {
                    return Err(
                        "primitive tasks cannot contain a process, service, or install command"
                            .into(),
                    );
                }
                if let Some(policy) = &task.cache {
                    if !operation.is_pure() {
                        return Err("remote side effects cannot be action cached".into());
                    }
                    if let remote::Operation::Digest {
                        input: remote::Input::File(path),
                        ..
                    } = operation
                    {
                        if !cache::safe_relative(path)
                            || !policy.inputs.iter().any(|input| path.starts_with(input))
                        {
                            return Err(
                                "cached digests require a relative path declared in cache inputs"
                                    .into(),
                            );
                        }
                    }
                }
            }
            if task
                .resources
                .iter()
                .chain(task.shared_resources.iter())
                .any(|r| r.is_empty())
                || task.resource_wait_timeout_ms == Some(0)
            {
                return Err("resource names and wait limits must be nonempty/positive".into());
            }
            if let Some(service) = &task.service {
                service.validate()?;
                if task.cache.is_some() {
                    return Err("services cannot be cached".into());
                }
            }
            if let Some(policy) = &task.cache {
                policy.validate()?;
                if self.inherit_env {
                    return Err(
                        "cached tasks require inherit_env: false and explicit environment values"
                            .into(),
                    );
                }
                if self.cache_dir.as_ref().is_none_or(|p| !p.is_absolute()) {
                    return Err("cached tasks require an absolute cache_dir".into());
                }
                cache::validate_storage(
                    task,
                    self.cache_dir.as_ref().expect("checked cache directory"),
                )?;
            }
            if task.program.is_empty() && task.file_operation.is_none() && task.primitive.is_none()
            {
                return Err(format!("task {} has no program", task.id));
            }
            if !task.cwd.is_absolute()
                || checked_directories.insert(task.cwd.as_path()) && !task.cwd.is_dir()
            {
                return Err(format!(
                    "task {} requires an existing absolute cwd: {}",
                    task.id,
                    task.cwd.display()
                ));
            }
            if task.timeout_ms == Some(0) {
                return Err(format!("task {} has a zero timeout", task.id));
            }
            for (key, value) in &task.env {
                if key.is_empty() || key.contains(['=', '\0']) || value.contains('\0') {
                    return Err(format!("task {} has an invalid environment entry", task.id));
                }
            }
        }
        let graph = DependencyGraph::from_tasks(&self.tasks)?;
        for (i, task) in self.tasks.iter().enumerate() {
            for reference in task.policy.bindings.values() {
                let producer = graph.dependencies[i]
                    .iter()
                    .find(|&&p| self.tasks[p].id == reference.task)
                    .copied()
                    .ok_or_else(|| "output bindings require a direct dependency".to_string())?;
                if !self.tasks[producer]
                    .policy
                    .outputs
                    .contains_key(&reference.name)
                    && !(reference.name == "value"
                        && self.tasks[producer]
                            .primitive
                            .as_ref()
                            .is_some_and(remote::Operation::is_pure))
                {
                    return Err("output binding references an undeclared output".into());
                }
            }
        }
        cache::validate_workspace(&self.tasks, &graph)?;
        let ancestors = service_ancestors(&graph, &self.tasks);
        for (i, parents) in ancestors.iter().enumerate() {
            for &p in parents {
                if self.tasks[p].service.is_some() {
                    if self.tasks[i].cache.is_some() {
                        return Err("service consumers cannot be cached".into());
                    }
                    if self.tasks[i].resources.iter().any(|r| {
                        self.tasks[p].resources.contains(r)
                            || self.tasks[p].shared_resources.contains(r)
                    }) || self.tasks[i]
                        .shared_resources
                        .iter()
                        .any(|r| self.tasks[p].resources.contains(r))
                    {
                        return Err(
                            "service and consumer cannot hold the same exclusive resource".into(),
                        );
                    }
                }
            }
        }
        Ok((graph, ancestors))
    }

    /// Run in a fresh caller-selected directory. All output is spooled to disk.
    /// Cancellation and process timeouts are observed at most one polling interval (10 ms)
    /// after the scheduler regains control. Resource leases coordinate runs sharing a resource directory.
    pub fn execute(&self, run_dir: &Path, cancel: &Cancellation) -> Result<RunResult, String> {
        let _active = cancel.enter();
        if let Some(workspace) = &self.workspace {
            return workspace.execute(self, run_dir, cancel);
        }
        if self.has_package_tasks() {
            self.resolve_packages()?
                .execute_resolved(run_dir, cancel, false)
        } else {
            self.execute_resolved(run_dir, cancel, false)
        }
    }
    fn execute_resolved(
        &self,
        run_dir: &Path,
        cancel: &Cancellation,
        workspace_created: bool,
    ) -> Result<RunResult, String> {
        let (graph, ancestors) = self.compile_graph()?;
        self.execute_compiled_graph(run_dir, cancel, workspace_created, &graph, &ancestors)
    }
    fn execute_compiled_graph(
        &self,
        run_dir: &Path,
        cancel: &Cancellation,
        workspace_created: bool,
        graph: &DependencyGraph,
        ancestors: &graph::Edges,
    ) -> Result<RunResult, String> {
        let absolute_run_dir = if run_dir.is_absolute() {
            run_dir.to_path_buf()
        } else {
            std::env::current_dir()
                .map_err(|e| e.to_string())?
                .join(run_dir)
        };
        for task in &self.tasks {
            if task.cache.is_some() && !workspace_created {
                cache::validate_storage(task, &absolute_run_dir)?;
            }
        }
        let resource_dir = if self
            .tasks
            .iter()
            .any(|t| !t.resources.is_empty() || !t.shared_resources.is_empty())
        {
            let root = resources::directory(self.resource_dir.as_deref())?;
            for task in &self.tasks {
                if task.cache.is_some() {
                    cache::validate_storage(task, &root)?;
                }
            }
            resources::initialize(&root)?;
            Some(root)
        } else {
            None
        };
        // Workspace execution already created this fresh private directory. Its
        // task paths are confined beneath the workspace sibling of the log files.
        if !workspace_created {
            let mut directory = fs::DirBuilder::new();
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                directory.mode(0o700);
            }
            directory
                .create(run_dir)
                .map_err(|e| format!("create run directory: {e}"))?;
        }
        let run_dir = fs::canonicalize(run_dir).map_err(|e| e.to_string())?;
        let environment: BTreeMap<OsString, OsString> = if self.inherit_env {
            std::env::vars_os().collect()
        } else {
            BTreeMap::new()
        };
        let mut results: Vec<_> = self
            .tasks
            .iter()
            .enumerate()
            .map(|(i, t)| TaskResult {
                id: t.id.clone(),
                status: Status::Pending,
                exit_code: None,
                signal: None,
                file_result: None,
                error: None,
                duration_ms: 0,
                stdout: run_dir.join(format!("{i}.stdout")),
                stderr: run_dir.join(format!("{i}.stderr")),
                probe_logs: t.service.as_ref().map(|_| service::ProbeLogs {
                    stdout: run_dir.join(format!("{i}.probe_stdout")),
                    stderr: run_dir.join(format!("{i}.probe_stderr")),
                }),
                cache: cache::CacheResult::disabled(),
                wait_reason: None,
                attempts: vec![],
                outputs: BTreeMap::new(),
                artifacts: BTreeMap::new(),
                condition_skipped: false,
                allowed_failure: t.policy.allow_failure,
            })
            .collect();
        let mut journal = events::Journal::new(&run_dir.join("events.jsonl"), &self.tasks)?;
        let mut supervisors: Vec<_> = results
            .iter()
            .enumerate()
            .map(|(i, result)| {
                result
                    .probe_logs
                    .clone()
                    .map(|logs| service::Supervisor::new(logs, journal.step_context(i)))
            })
            .collect();
        let mut shutdowns: Vec<Option<service::Shutdown>> =
            (0..self.tasks.len()).map(|_| None).collect();
        let wake = worker::Wake::default();
        let mut running: Vec<Running> = Vec::new();
        let mut saving: Vec<Saving> = Vec::new();
        let mut preparing: Vec<Preparing> = Vec::new();
        let mut resources = HashSet::new();
        let mut readers: HashMap<String, usize> = HashMap::new();
        let mut waiting_since: Vec<Option<Instant>> = vec![None; self.tasks.len()];
        let mut retry_at: Vec<Option<Instant>> = vec![None; self.tasks.len()];
        let mut cache_started: Vec<Option<Instant>> = vec![None; self.tasks.len()];
        let mut resolved_tasks = self.tasks.clone();
        let mut retry_actions: Vec<Option<cache::Prepared>> =
            (0..self.tasks.len()).map(|_| None).collect();
        let mut first_started: Vec<Option<Instant>> = vec![None; self.tasks.len()];
        let incremental = self.tasks.iter().all(|task| {
            task.service.is_none()
                && task.cache.is_none()
                && task.resources.is_empty()
                && task.shared_resources.is_empty()
                && task.resource_wait_timeout_ms.is_none()
                && task.policy.when == workflow::Condition::Success
                && task.policy.retry.is_none()
        });
        let mut frontier = incremental.then(|| graph::Frontier::new(graph));
        let mut failed = false;
        let mut stalled = false;
        loop {
            let mut touched: Vec<usize> = if frontier.is_some() {
                running
                    .iter()
                    .map(|running| running.index)
                    .chain(saving.iter().map(|saving| saving.index))
                    .collect()
            } else {
                vec![]
            };
            let stopping = stalled || cancel.is_cancelled() || (self.fail_fast && failed);
            let mut lookup_index = 0;
            while lookup_index < preparing.len() {
                let lookup = &mut preparing[lookup_index];
                let i = lookup.index;
                results[i].duration_ms = lookup.started.elapsed().as_millis();
                if lookup.stop.is_none() {
                    if stopping && !self.tasks[i].policy.when.finalizer() {
                        lookup.stop = Some(Status::Cancelled);
                    } else if self.tasks[i]
                        .timeout_ms
                        .is_some_and(|ms| lookup.started.elapsed() >= Duration::from_millis(ms))
                    {
                        lookup.stop = Some(Status::TimedOut);
                    }
                    if lookup.stop.is_some() {
                        lookup.worker.cancel();
                    }
                }
                let Some(outcome) = lookup.worker.poll() else {
                    lookup_index += 1;
                    continue;
                };
                let mut lookup = preparing.swap_remove(lookup_index);
                if let Some(status) = lookup.stop.take() {
                    results[i].status = status;
                    results[i].cache.outcome = "cancelled".into();
                    results[i].cache.reason = "cache preparation interrupted".into();
                    results[i].error = Some(results[i].cache.reason.clone());
                    failed |= !self.tasks[i].policy.allow_failure;
                } else {
                    match outcome {
                        Ok(Some(found)) => {
                            results[i].cache.key = Some(found.action.key.clone());
                            results[i].cache.components = found.action.components.clone();
                            results[i].cache.reason = found.reason;
                            if found.hit {
                                results[i].status = Status::Succeeded;
                                if self.tasks[i].file_operation.is_some() {
                                    results[i].file_result =
                                        Some(files::result(&results[i].stdout)?);
                                } else if self.tasks[i].primitive.is_none() {
                                    results[i].exit_code = Some(0);
                                }
                                if self.tasks[i]
                                    .primitive
                                    .as_ref()
                                    .is_some_and(remote::Operation::is_pure)
                                {
                                    let value = fs::read_to_string(&results[i].stdout)
                                        .map_err(|error| error.to_string())?
                                        .trim_end()
                                        .to_owned();
                                    results[i].outputs.insert("value".into(), value);
                                }
                                results[i].cache.outcome = "hit".into();
                                if self.tasks[i].policy.products() {
                                    let task = resolved_tasks[i].clone();
                                    let publication_dir = run_dir.clone();
                                    let action = found.action;
                                    match worker::Worker::spawn(&wake, move |token| {
                                        let _action = action;
                                        workflow::collect(&task, &publication_dir, i, &token)
                                    }) {
                                        Ok(worker) => {
                                            saving.push(Saving {
                                                index: i,
                                                started: lookup.started,
                                                worker,
                                                cache_outcome: "hit".into(),
                                                _leases: lookup.leases.take(),
                                                stop: None,
                                            });
                                            results[i].status = Status::Running;
                                            continue;
                                        }
                                        Err(error) => {
                                            results[i].status = Status::Failed;
                                            results[i].error = Some(error);
                                            failed |= !self.tasks[i].policy.allow_failure;
                                        }
                                    }
                                }
                            } else if (cancel.is_cancelled() || (self.fail_fast && failed))
                                && !self.tasks[i].policy.when.finalizer()
                            {
                                results[i].status = Status::Cancelled;
                                results[i].cache.outcome = "cancelled".into();
                            } else {
                                results[i].cache.outcome = "miss".into();
                                match start(
                                    &resolved_tasks[i],
                                    &results[i],
                                    &environment,
                                    Some(&found.action.executable),
                                    &wake,
                                ) {
                                    Ok((child, native)) => {
                                        running.push(Running {
                                            index: i,
                                            child,
                                            native,
                                            started: lookup.started,
                                            attempt_started: Instant::now(),
                                            leases: lookup.leases.take(),
                                            action: Some(found.action),
                                        });
                                        continue;
                                    }
                                    Err(error) => {
                                        results[i].status = Status::Failed;
                                        results[i].error = Some(error.to_string());
                                        failed |= !self.tasks[i].policy.allow_failure;
                                    }
                                }
                            }
                        }
                        Ok(None) => {
                            results[i].status = Status::Pending;
                            results[i].cache.outcome = "waiting".into();
                            results[i].cache.reason = "another execution owns this action".into();
                            retry_at[i] = Some(Instant::now() + Duration::from_millis(50));
                        }
                        Err(error) => {
                            results[i].status = Status::Failed;
                            results[i].error = Some(error.clone());
                            results[i].cache.outcome = "error".into();
                            results[i].cache.reason = error;
                            failed |= !self.tasks[i].policy.allow_failure;
                        }
                    }
                }
                release_resources(&self.tasks[i], &mut resources, &mut readers);
            }
            // Cache publication retains both a job slot and resource leases.
            let mut publication = 0;
            while publication < saving.len() {
                let save = &mut saving[publication];
                let i = save.index;
                results[i].duration_ms = save.started.elapsed().as_millis();
                if save.stop.is_none() {
                    if stopping && !self.tasks[i].policy.when.finalizer() {
                        save.stop = Some(Status::Cancelled);
                    } else if self.tasks[i]
                        .timeout_ms
                        .is_some_and(|ms| save.started.elapsed() >= Duration::from_millis(ms))
                    {
                        save.stop = Some(Status::TimedOut);
                    }
                    if save.stop.is_some() {
                        save.worker.cancel();
                    }
                }
                if let Some(outcome) = save.worker.poll() {
                    let status = save.stop.take().unwrap_or_else(|| {
                        if outcome.is_ok() {
                            Status::Succeeded
                        } else {
                            Status::Failed
                        }
                    });
                    if status == Status::Succeeded {
                        let products = outcome.expect("successful publication");
                        results[i].outputs.extend(products.outputs);
                        results[i].artifacts = products.artifacts;
                        results[i].cache.outcome = save.cache_outcome.clone();
                    } else {
                        results[i].cache.outcome = if status == Status::Failed {
                            "error"
                        } else {
                            "cancelled"
                        }
                        .into();
                        let error = outcome
                            .err()
                            .unwrap_or_else(|| "cache publication interrupted".into());
                        results[i].cache.reason = error.clone();
                        results[i].error = Some(error);
                        failed |= !self.tasks[i].policy.allow_failure;
                    }
                    results[i].status = status;
                    saving.swap_remove(publication);
                    release_resources(&self.tasks[i], &mut resources, &mut readers);
                } else {
                    publication += 1;
                }
            }
            // Reap before dispatch: completion releases dependencies and resource leases.
            let mut n = 0;
            while n < running.len() {
                let i = running[n].index;
                let elapsed = running[n].started.elapsed();
                let attempt_elapsed = running[n].attempt_started.elapsed();
                results[i].duration_ms = elapsed.as_millis();
                let timed_out = self.tasks[i]
                    .timeout_ms
                    .is_some_and(|ms| elapsed >= Duration::from_millis(ms));
                let dependency_failed = ancestors[i].iter().any(|&p| {
                    (results[p].status.terminal()
                        && !workflow::satisfied(&results[p], &self.tasks[p]))
                        || shutdowns[p]
                            .as_ref()
                            .is_some_and(|shutdown| shutdown.status != Status::Succeeded)
                });
                let outcome = if let Some(config) = &self.tasks[i].service {
                    let child_exit = running[n].child.as_mut().expect("process task").try_wait();
                    if let Ok(Some(exit)) = child_exit {
                        let (code, signal) = diagnostics::process_exit(&exit);
                        results[i].signal = signal;
                        if let Some(shutdown) = shutdowns[i].take() {
                            Some((shutdown.status, Some(code), shutdown.error))
                        } else {
                            Some((
                                Status::Failed,
                                Some(code),
                                Some("service exited before shutdown".into()),
                            ))
                        }
                    } else if let Err(error) = child_exit {
                        Some((Status::Failed, None, Some(error.to_string())))
                    } else {
                        if shutdowns[i].is_none() {
                            let startup_expired = !supervisors[i].as_ref().unwrap().ready
                                && elapsed >= Duration::from_millis(config.startup_timeout_ms);
                            let unused = results[i].status == Status::Ready
                                && !ancestors.iter().enumerate().any(|(j, parents)| {
                                    parents.contains(&i) && !results[j].status.terminal()
                                });
                            let stop = if stopping || dependency_failed {
                                Some((
                                    if stalled {
                                        Status::Failed
                                    } else {
                                        Status::Cancelled
                                    },
                                    Some(
                                        if stalled {
                                            "service capacity or resource leases prevent progress"
                                        } else {
                                            "service cancelled"
                                        }
                                        .into(),
                                    ),
                                ))
                            } else if timed_out {
                                Some((Status::TimedOut, Some("service task timeout".into())))
                            } else if startup_expired {
                                let mut reason = format!(
                                    "service startup timeout after {} ms",
                                    config.startup_timeout_ms
                                );
                                if let Some(failure) =
                                    supervisors[i].as_ref().unwrap().last_failure()
                                {
                                    reason.push_str(": last failure: ");
                                    reason.push_str(failure);
                                }
                                Some((Status::TimedOut, Some(reason)))
                            } else if unused {
                                Some((Status::Succeeded, None))
                            } else {
                                match supervisors[i]
                                    .as_mut()
                                    .unwrap()
                                    .poll(&resolved_tasks[i], &environment)
                                {
                                    service::Health::Ready => {
                                        results[i].status = Status::Ready;
                                        None
                                    }
                                    service::Health::Failed(error) => {
                                        Some((Status::Failed, Some(error)))
                                    }
                                    service::Health::Waiting => None,
                                }
                            };
                            if let Some((status, error)) = stop {
                                supervisors[i].as_mut().unwrap().stop();
                                if status != Status::Succeeded {
                                    failed |= !self.tasks[i].policy.allow_failure;
                                }
                                shutdowns[i] = Some(service::Shutdown {
                                    started: None,
                                    status,
                                    error,
                                });
                                results[i].status = Status::Stopping;
                            }
                        }
                        if let Some(shutdown) = &mut shutdowns[i] {
                            if shutdown.started.is_none()
                                && !ancestors.iter().enumerate().any(|(j, parents)| {
                                    parents.contains(&i) && !results[j].status.terminal()
                                })
                            {
                                #[cfg(unix)]
                                unsafe {
                                    libc::kill(
                                        -(running[n].child.as_ref().expect("service process").id()
                                            as i32),
                                        libc::SIGTERM,
                                    );
                                }
                                #[cfg(not(unix))]
                                {
                                    let _ =
                                        running[n].child.as_mut().expect("service process").kill();
                                }
                                shutdown.started = Some(Instant::now());
                            }
                        }
                        if shutdowns[i]
                            .as_ref()
                            .and_then(|s| s.started)
                            .is_some_and(|start| {
                                start.elapsed() >= Duration::from_millis(config.shutdown_timeout_ms)
                            })
                        {
                            running[n].terminate();
                            let shutdown = shutdowns[i].take().unwrap();
                            Some((shutdown.status, None, shutdown.error))
                        } else {
                            None
                        }
                    }
                } else if (stopping || dependency_failed) && !self.tasks[i].policy.when.finalizer()
                    || timed_out
                {
                    running[n].terminate();
                    Some((
                        if timed_out {
                            Status::TimedOut
                        } else {
                            Status::Cancelled
                        },
                        None,
                        None,
                    ))
                } else if let Some(worker) = &mut running[n].native {
                    worker.poll().map(|outcome| match outcome {
                        Ok(()) if self.tasks[i].primitive.is_some() => {
                            (Status::Succeeded, None, None)
                        }
                        Ok(()) => match files::result(&results[i].stdout) {
                            Ok(value) => {
                                results[i].file_result = Some(value);
                                (Status::Succeeded, None, None)
                            }
                            Err(error) => (Status::Failed, None, Some(error)),
                        },
                        Err(error) => (Status::Failed, None, Some(error)),
                    })
                } else {
                    match running[n].child.as_mut().expect("process task").try_wait() {
                        Ok(Some(status)) => {
                            let (code, signal) = diagnostics::process_exit(&status);
                            results[i].signal = signal;
                            Some((
                                if status.success() {
                                    Status::Succeeded
                                } else {
                                    Status::Failed
                                },
                                Some(code),
                                None,
                            ))
                        }
                        Ok(None) => None,
                        Err(e) => Some((Status::Failed, None, Some(e.to_string()))),
                    }
                };
                if let Some((status, code, error)) = outcome {
                    results[i].status = status;
                    results[i].exit_code = code;
                    results[i].error = error;
                    results[i].duration_ms = elapsed.as_millis();
                    if results[i].status == Status::Succeeded
                        && self.tasks[i]
                            .primitive
                            .as_ref()
                            .is_some_and(remote::Operation::is_pure)
                    {
                        let value = fs::read_to_string(&results[i].stdout)
                            .map_err(|error| error.to_string())?
                            .trim_end()
                            .to_owned();
                        results[i].outputs.insert("value".into(), value);
                    }
                    // Stop background descendants before capturing output artifacts.
                    let completed_leases = running[n].leases.take();
                    let completed_action = running[n].action.take();
                    let task_started = running[n].started;
                    running.swap_remove(n);
                    if let Some(supervisor) = &mut supervisors[i] {
                        supervisor.stop();
                    }
                    if results[i].status == Status::TimedOut {
                        if self.tasks[i].file_operation.is_none() {
                            results[i].exit_code = Some(124);
                        }
                        let message = results[i].error.take().unwrap_or_else(|| {
                            format!(
                                "task timed out after {} ms",
                                self.tasks[i].timeout_ms.unwrap_or(0)
                            )
                        });
                        results[i].error = Some(diagnostics::with_process_output(
                            format!("exit code 124: {message}"),
                            &results[i].stderr,
                            &results[i].stdout,
                        ));
                    } else if results[i].status == Status::Cancelled {
                        if self.tasks[i].file_operation.is_none() {
                            results[i].exit_code = Some(130);
                        }
                        results[i]
                            .error
                            .get_or_insert_with(|| "exit code 130: task cancelled".into());
                    } else if results[i].status == Status::Failed
                        && self.tasks[i].file_operation.is_some()
                    {
                        results[i]
                            .error
                            .get_or_insert_with(|| "native file operation failed".into());
                    } else if results[i].status == Status::Failed {
                        let message = results[i].error.take();
                        results[i].error = Some(match message {
                            Some(message) => diagnostics::with_process_output(
                                format!(
                                    "exit code {}: {message}",
                                    results[i].exit_code.unwrap_or(1)
                                ),
                                &results[i].stderr,
                                &results[i].stdout,
                            ),
                            None => diagnostics::process_error(
                                &self.tasks[i].program,
                                results[i].exit_code.unwrap_or(1),
                                results[i].signal,
                                &results[i].stderr,
                                &results[i].stdout,
                            ),
                        });
                    }
                    if matches!(results[i].status, Status::Failed | Status::TimedOut) {
                        if let Some(probes) = &results[i].probe_logs {
                            let diagnostic = diagnostics::with_process_output(
                                "probe output".into(),
                                &probes.stderr,
                                &probes.stdout,
                            );
                            if diagnostic != "probe output" {
                                let message = results[i]
                                    .error
                                    .take()
                                    .unwrap_or_else(|| "service failed".into());
                                results[i].error = Some(format!("{message}\n{diagnostic}"));
                            }
                        }
                    }
                    if self.tasks[i].service.is_none() {
                        let number = results[i].attempts.len() + 1;
                        let attempt = workflow::Attempt {
                            number,
                            status: results[i].status.clone(),
                            exit_code: results[i].exit_code,
                            duration_ms: attempt_elapsed.as_millis(),
                            error: results[i].error.clone(),
                        };
                        results[i].attempts.push(attempt);
                    }
                    let retry = self.tasks[i].policy.retry.as_ref().filter(|policy| {
                        results[i].status == Status::Failed
                            && results[i].signal.is_none()
                            && (code.is_some_and(|code| {
                                policy.exit_codes.is_empty() || policy.exit_codes.contains(&code)
                            }) || (self.tasks[i].file_operation.is_some()
                                || self.tasks[i].primitive.is_some())
                                && policy.exit_codes.is_empty())
                            && results[i].attempts.len() < policy.max_attempts as usize
                            && !cancel.is_cancelled()
                            && !stalled
                            && (self.tasks[i].policy.when.finalizer() || !self.fail_fast || !failed)
                    });
                    if let Some(policy) = retry {
                        retry_actions[i] = completed_action;
                        release_resources(&self.tasks[i], &mut resources, &mut readers);
                        drop(completed_leases);
                        retry_at[i] = Some(
                            Instant::now()
                                + Duration::from_millis(policy.delay(results[i].attempts.len())),
                        );
                        results[i].status = Status::Pending;
                        results[i].wait_reason = Some(format!(
                            "retry attempt {} of {}",
                            results[i].attempts.len() + 1,
                            policy.max_attempts
                        ));
                        continue;
                    }
                    if results[i].status == Status::Succeeded
                        && (completed_action.is_some() || self.tasks[i].policy.products())
                    {
                        let cache_outcome = if completed_action.is_some() {
                            "stored"
                        } else {
                            "disabled"
                        }
                        .to_string();
                        let task = resolved_tasks[i].clone();
                        let stdout = results[i].stdout.clone();
                        let stderr = results[i].stderr.clone();
                        let publication_dir = run_dir.clone();
                        match worker::Worker::spawn(&wake, move |token| {
                            let products = workflow::collect(&task, &publication_dir, i, &token)?;
                            if let Some(action) = completed_action {
                                action
                                    .with_cancellation(token)
                                    .save(&task, &stdout, &stderr)?;
                            }
                            Ok(products)
                        }) {
                            Ok(worker) => {
                                saving.push(Saving {
                                    index: i,
                                    started: task_started,
                                    worker,
                                    cache_outcome,
                                    _leases: completed_leases,
                                    stop: None,
                                });
                                results[i].status = Status::Running;
                                results[i].cache.outcome = "storing".into();
                                continue;
                            }
                            Err(error) => {
                                results[i].status = Status::Failed;
                                results[i].error = Some(error.clone());
                                results[i].cache.outcome = "error".into();
                                results[i].cache.reason = error;
                            }
                        }
                    }
                    release_resources(&self.tasks[i], &mut resources, &mut readers);
                    drop(completed_leases);
                    if results[i].status != Status::Succeeded {
                        failed |= !self.tasks[i].policy.allow_failure;
                    }
                } else {
                    n += 1;
                }
            }
            if let Some(frontier) = &mut frontier {
                for &index in &touched {
                    if results[index].status.terminal() {
                        frontier.complete(index, graph);
                    }
                }
                if cancel.is_cancelled() || (self.fail_fast && failed) {
                    for (index, result) in results.iter_mut().enumerate() {
                        if result.status == Status::Pending {
                            result.status = Status::Cancelled;
                            frontier.complete(index, graph);
                            touched.push(index);
                        }
                    }
                }
            }
            // Complex lifecycle policies retain their established topological sweep.
            // Ordinary command DAGs admit only ready nodes, visiting each edge once.
            let mut position = 0;
            loop {
                let next = if let Some(frontier) = &mut frontier {
                    if running.len() + saving.len() >= self.jobs {
                        None
                    } else {
                        frontier.next()
                    }
                } else {
                    let next = graph.order.get(position).copied();
                    position += 1;
                    next
                };
                let Some(i) = next else {
                    break;
                };
                if frontier.is_some() {
                    touched.push(i);
                }

                if results[i].status != Status::Pending {
                    continue;
                }
                let gate = workflow::gate(
                    &self.tasks[i],
                    &graph.dependencies[i],
                    &results,
                    &self.tasks,
                );
                // A failed service waits for consumers before it can finish
                // shutdown. Skip ordinary consumers while it is still stopping;
                // waiting for its terminal state would deadlock both sides.
                let failed_service = ancestors[i].iter().any(|&parent| {
                    (results[parent].status.terminal()
                        && !workflow::satisfied(&results[parent], &self.tasks[parent]))
                        || shutdowns[parent]
                            .as_ref()
                            .is_some_and(|shutdown| shutdown.status != Status::Succeeded)
                });
                if failed_service && !self.tasks[i].policy.when.finalizer() {
                    results[i].status = Status::Skipped;
                } else if matches!(gate, workflow::Gate::Skip) {
                    results[i].status = Status::Skipped;
                    results[i].condition_skipped = self.tasks[i].policy.when
                        != workflow::Condition::Success
                        || graph.dependencies[i].iter().all(|&p| {
                            results[p].condition_skipped
                                || workflow::satisfied(&results[p], &self.tasks[p])
                        });
                } else if stalled
                    || (cancel.is_cancelled() || (self.fail_fast && failed))
                        && !self.tasks[i].policy.when.finalizer()
                {
                    results[i].status = Status::Cancelled;
                } else if cache_started[i].or(first_started[i]).is_some_and(|start| {
                    self.tasks[i]
                        .timeout_ms
                        .is_some_and(|ms| start.elapsed() >= Duration::from_millis(ms))
                }) {
                    results[i].status = Status::TimedOut;
                    results[i].cache.outcome = "cancelled".into();
                    results[i].error = Some(
                        if self.tasks[i].cache.is_some() {
                            "cache preparation timeout"
                        } else {
                            "task timeout while waiting to retry"
                        }
                        .into(),
                    );
                    results[i].duration_ms =
                        first_started[i].map_or(0, |start| start.elapsed().as_millis());
                    failed |= !self.tasks[i].policy.allow_failure;
                } else if waiting_since[i].is_some_and(|since| {
                    self.tasks[i]
                        .resource_wait_timeout_ms
                        .is_some_and(|limit| since.elapsed() >= Duration::from_millis(limit))
                }) {
                    // Once contention starts, its deadline keeps running even
                    // while another task occupies the job/service slot or a
                    // lease retry is backed off. Never admit an expired waiter.
                    results[i].status = Status::TimedOut;
                    results[i].error = Some("resource wait timeout".into());
                    failed |= !self.tasks[i].policy.allow_failure;
                } else if matches!(gate, workflow::Gate::Ready)
                    && if self.tasks[i].service.is_some() {
                        running
                            .iter()
                            .filter(|r| self.tasks[r.index].service.is_some())
                            .count()
                            < self.max_services
                    } else {
                        running
                            .iter()
                            .filter(|r| self.tasks[r.index].service.is_none())
                            .count()
                            + saving.len()
                            + preparing.len()
                            < self.jobs
                    }
                {
                    if retry_at[i].is_some_and(|next| Instant::now() < next) {
                        continue;
                    }
                    let started = Instant::now();
                    let acquired = if let Some(root) = &resource_dir {
                        if let Some(name) = self.tasks[i]
                            .resources
                            .iter()
                            .find(|r| resources.contains(*r) || readers.contains_key(*r))
                            .or_else(|| {
                                self.tasks[i]
                                    .shared_resources
                                    .iter()
                                    .find(|r| resources.contains(*r))
                            })
                        {
                            Ok(resources::Attempt::Busy(name.clone()))
                        } else {
                            resources::acquire(
                                root,
                                &self.tasks[i].resources,
                                &self.tasks[i].shared_resources,
                            )
                        }
                    } else {
                        resources::acquire(Path::new(""), &[], &[])
                    };
                    let task_leases = match acquired {
                        Ok(resources::Attempt::Acquired(leases)) => {
                            results[i].wait_reason = None;
                            waiting_since[i] = None;
                            retry_at[i] = None;
                            leases
                        }
                        Ok(resources::Attempt::Busy(name)) => {
                            let since = *waiting_since[i].get_or_insert_with(Instant::now);
                            results[i].wait_reason = Some(format!("resource: {name}"));
                            if self.tasks[i].resource_wait_timeout_ms.is_some_and(|limit| {
                                since.elapsed() >= Duration::from_millis(limit)
                            }) {
                                results[i].status = Status::TimedOut;
                                results[i].error = Some("resource wait timeout".into());
                                failed |= !self.tasks[i].policy.allow_failure;
                            } else {
                                retry_at[i] = Some(Instant::now() + Duration::from_millis(50));
                            }
                            continue;
                        }
                        Err(error) => {
                            results[i].status = Status::Failed;
                            results[i].error = Some(format!("resource lease: {error}"));
                            failed |= !self.tasks[i].policy.allow_failure;
                            continue;
                        }
                    };
                    results[i].exit_code = None;
                    results[i].signal = None;
                    results[i].error = None;
                    resolved_tasks[i] = match files::resolve_env(&self.tasks[i])
                        .and_then(|task| workflow::resolve(&task, &results))
                    {
                        Ok(task) => task,
                        Err(error) => {
                            results[i].status = Status::Failed;
                            results[i].error = Some(error);
                            failed |= !self.tasks[i].policy.allow_failure;
                            continue;
                        }
                    };
                    let started = *first_started[i].get_or_insert(started);
                    if self.tasks[i].cache.is_some() && retry_actions[i].is_none() {
                        let started = *cache_started[i].get_or_insert(started);
                        let dependency_keys: Vec<_> = graph.dependencies[i]
                            .iter()
                            .map(|&p| {
                                results[p].cache.key.clone().unwrap_or_else(|| {
                                    format!("uncached:{}:{}", run_dir.display(), self.tasks[p].id)
                                })
                            })
                            .collect();
                        let task = resolved_tasks[i].clone();
                        let root = self
                            .cache_dir
                            .as_ref()
                            .expect("validated cache directory")
                            .clone();
                        let stdout = results[i].stdout.clone();
                        let stderr = results[i].stderr.clone();
                        match worker::Worker::spawn(&wake, move |token| {
                            cache::lookup(&root, &task, &dependency_keys, &stdout, &stderr, &token)
                        }) {
                            Ok(worker) => {
                                resources.extend(self.tasks[i].resources.iter().cloned());
                                for resource in &self.tasks[i].shared_resources {
                                    *readers.entry(resource.clone()).or_default() += 1;
                                }
                                preparing.push(Preparing {
                                    index: i,
                                    started,
                                    worker,
                                    leases: Some(task_leases),
                                    stop: None,
                                });
                                results[i].status = Status::Running;
                                results[i].cache.outcome = "preparing".into();
                            }
                            Err(error) => {
                                results[i].status = Status::Failed;
                                results[i].error = Some(error);
                                results[i].cache.outcome = "error".into();
                                failed |= !self.tasks[i].policy.allow_failure;
                            }
                        }
                        continue;
                    }
                    if cancel.is_cancelled() && !self.tasks[i].policy.when.finalizer() {
                        results[i].status = Status::Cancelled;
                        continue;
                    }
                    let action = retry_actions[i].take();
                    match start(
                        &resolved_tasks[i],
                        &results[i],
                        &environment,
                        action.as_ref().map(|a| a.executable.as_path()),
                        &wake,
                    ) {
                        Ok((child, native)) => {
                            resources.extend(self.tasks[i].resources.iter().cloned());
                            for resource in &self.tasks[i].shared_resources {
                                *readers.entry(resource.clone()).or_default() += 1;
                            }
                            results[i].status = Status::Running;
                            running.push(Running {
                                index: i,
                                child,
                                native,
                                started,
                                attempt_started: Instant::now(),
                                leases: Some(task_leases),
                                action,
                            });
                        }
                        Err(e) => {
                            results[i].status = Status::Failed;
                            results[i].error = Some(e.to_string());
                            failed |= !self.tasks[i].policy.allow_failure;
                        }
                    }
                }
                if let Some(frontier) = &mut frontier {
                    if results[i].status.terminal() {
                        frontier.complete(i, graph);
                    }
                }
            }
            if let Some(frontier) = &mut frontier {
                for &index in &touched {
                    if results[index].status.terminal() {
                        frontier.complete(index, graph);
                    }
                }
            }
            // A set of ready daemons can occupy all capacity/resources required by
            // their pending consumers. Fail with cleanup instead of waiting forever.
            if preparing.is_empty()
                && saving.is_empty()
                && !running.is_empty()
                && running
                    .iter()
                    .all(|r| results[r.index].status == Status::Ready)
                && results.iter().any(|r| r.status == Status::Pending)
                && !running.iter().any(|r| {
                    !ancestors.iter().enumerate().any(|(j, parents)| {
                        parents.contains(&r.index) && !results[j].status.terminal()
                    })
                })
                && !results.iter().enumerate().any(|(i, r)| {
                    r.status == Status::Pending
                        && matches!(
                            workflow::gate(
                                &self.tasks[i],
                                &graph.dependencies[i],
                                &results,
                                &self.tasks
                            ),
                            workflow::Gate::Ready
                        )
                        && self.tasks[i]
                            .resources
                            .iter()
                            .all(|r| !resources.contains(r) && !readers.contains_key(r))
                        && self.tasks[i]
                            .shared_resources
                            .iter()
                            .all(|r| !resources.contains(r))
                        && (self.tasks[i].service.is_none() || running.len() < self.max_services)
                })
            {
                stalled = true;
            }
            let finished = frontier.as_ref().map_or_else(
                || results.iter().all(|r| r.status.terminal()),
                graph::Frontier::finished,
            );
            if let Some(frontier) = &frontier {
                if finished {
                    journal.update(&results, &graph.order, true)?;
                } else {
                    touched.sort_unstable_by_key(|&node| frontier.rank(node));
                    touched.dedup();
                    journal.update(&results, &touched, false)?;
                }
            } else {
                journal.update(&results, &graph.order, finished)?;
            }
            if finished {
                break;
            }
            wake.wait(Duration::from_millis(10));
        }
        // Capture the terminal outcome once; later cancellation requests must not
        // change how a published report is interpreted by the server or recovery.
        let outcome = if results.iter().all(|task| {
            task.status == Status::Succeeded
                || task.condition_skipped
                || task.allowed_failure && matches!(task.status, Status::Failed | Status::TimedOut)
        }) {
            RunOutcome::Succeeded
        } else if cancel.is_cancelled() {
            RunOutcome::Cancelled
        } else {
            RunOutcome::Failed
        };
        let result = RunResult {
            outcome,
            tasks: results,
        };
        journal.finish(result.success())?;
        // Readers and restart recovery see a complete report or no report.
        let mut report = tempfile::NamedTempFile::new_in(&run_dir).map_err(|e| e.to_string())?;
        {
            let mut writer = BufWriter::new(report.as_file_mut());
            serde_json::to_writer_pretty(&mut writer, &result).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
        }
        report.as_file().sync_all().map_err(|e| e.to_string())?;
        report
            .persist(run_dir.join("result.json"))
            .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        File::open(&run_dir)
            .and_then(|directory| directory.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(result)
    }
}

fn service_ancestors(graph: &DependencyGraph, tasks: &[Task]) -> graph::Edges {
    if tasks.iter().all(|task| task.service.is_none()) {
        return graph::Edges::empty(tasks.len());
    }
    let mut ancestors: Vec<Vec<usize>> = vec![vec![]; tasks.len()];
    for &node in &graph.order {
        let mut parents = vec![];
        for &parent in &graph.dependencies[node] {
            parents.extend_from_slice(&ancestors[parent]);
            if tasks[parent].service.is_some() {
                parents.push(parent);
            }
        }
        parents.sort_unstable();
        parents.dedup();
        ancestors[node] = parents;
    }
    graph::Edges::from_lists(ancestors)
}

fn log_output(path: &Path, append: bool) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true);
    if append {
        options.append(true);
    } else {
        options.create_new(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path)?;
    if !file.metadata()?.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "log is not a regular file",
        ));
    }
    Ok(file)
}

fn start(
    task: &Task,
    result: &TaskResult,
    inherited: &BTreeMap<OsString, OsString>,
    executable: Option<&Path>,
    wake: &worker::Wake,
) -> std::io::Result<(Option<Child>, Option<worker::Worker<()>>)> {
    if task.file_operation.is_some() || task.primitive.is_some() {
        let stdout = log_output(&result.stdout, !result.attempts.is_empty())?;
        stdout.set_len(0)?;
        let stderr = log_output(&result.stderr, !result.attempts.is_empty())?;
        let task = task.clone();
        let inherited = inherited.clone();
        let worker = worker::Worker::spawn(wake, move |cancel| {
            if task.primitive.is_some() {
                remote::execute(&task, &inherited, stdout, stderr, &cancel)
            } else {
                files::execute(&task, stdout, stderr, &cancel)
            }
        })
        .map_err(std::io::Error::other)?;
        Ok((None, Some(worker)))
    } else {
        spawn(task, result, inherited, executable).map(|child| (Some(child), None))
    }
}

fn spawn(
    task: &Task,
    result: &TaskResult,
    inherited: &BTreeMap<OsString, OsString>,
    executable: Option<&Path>,
) -> std::io::Result<Child> {
    let mut command = Command::new(executable.unwrap_or_else(|| Path::new(&task.program)));
    command
        .args(&task.args)
        .current_dir(&task.cwd)
        .env_clear()
        .envs(inherited)
        .envs(&task.env)
        .stdin(Stdio::null())
        .stdout(log_output(&result.stdout, !result.attempts.is_empty())?)
        .stderr(log_output(&result.stderr, !result.attempts.is_empty())?);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command.spawn()
}

#[cfg(all(test, unix))]
mod cache_worker_tests;
