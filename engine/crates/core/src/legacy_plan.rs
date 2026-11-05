//! Compatibility compiler. Every legacy command, eager operation and finalizer
//! is executed by fluentci-executor; provider hooks run in isolated subprocesses.
use crate::deps::Graph;
use anyhow::{anyhow, bail, Context, Error};
use fluentci_executor::{Cancellation, Plan, Task};
use fluentci_ext::worker::{Command, Provider, Request};
use fluentci_types::Output;
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

const SKIP: &[&str] = &[
    "git",
    "git-checkout",
    "git-last-commit",
    "tree",
    "http",
    "cache",
    "file",
    "directory",
    "chmod",
    "withFile",
    "asService",
    "trust",
];

fn task(
    id: String,
    program: String,
    args: Vec<String>,
    cwd: PathBuf,
    environment: &BTreeMap<String, String>,
) -> Task {
    fluentci_executor::primitives::env(
        fluentci_executor::primitives::exec(id, program, args, cwd),
        environment.clone(),
    )
}
fn plan(tasks: Vec<Task>) -> Plan {
    fluentci_executor::primitives::plan(tasks)
}
fn write_request(path: &Path, request: &Request) -> Result<(), Error> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(&serde_json::to_vec(request)?)?;
    Ok(())
}
fn worker_task(
    graph: &Graph,
    id: String,
    commands: Vec<Command>,
    root: &Path,
    environment: &BTreeMap<String, String>,
) -> Result<Task, Error> {
    let path = root.join(format!("{}.json", uuid::Uuid::new_v4()));
    let cwd = commands
        .first()
        .context("empty provider request")?
        .cwd
        .clone();
    write_request(
        &path,
        &Request {
            version: 1,
            commands,
        },
    )?;
    Ok(task(
        id,
        graph
            .worker_executable
            .to_str()
            .context("non-UTF-8 worker path")?
            .into(),
        vec![
            "provider-worker".into(),
            path.to_str().context("non-UTF-8 request path")?.into(),
        ],
        cwd,
        environment,
    ))
}
fn cwd(path: &str) -> Result<PathBuf, Error> {
    let path =
        fs::canonicalize(path).with_context(|| format!("Invalid working directory: {path}"))?;
    if !path.is_dir() {
        bail!("working directory is not a directory");
    }
    Ok(path)
}
struct Compiled {
    plan: Plan,
    cleanup: Plan,
    capture: Option<PathBuf>,
    target: Option<String>,
    final_cwd: PathBuf,
}
fn compile(
    graph: &Graph,
    requested: Option<&str>,
    output: Output,
    root: &Path,
) -> Result<Compiled, Error> {
    let order = graph.execution_order()?;
    let selected = requested
        .map(|id| {
            graph
                .vertices
                .iter()
                .position(|v| v.id == id)
                .ok_or_else(|| anyhow!("Vertex not found: {id}"))
        })
        .transpose()?;
    let mut working = cwd(&graph.work_dir)?;
    let mut tasks = vec![];
    let mut cleanup = vec![];
    let mut capture = None;
    let mut target = None;
    let mut previous = None;
    // Eager utility operations deliberately execute only their requested vertex;
    // construction-time file queries must not replay pending pipeline commands.
    for i in order {
        if selected.is_some_and(|selected| selected != i) {
            continue;
        }
        let vertex = &graph.vertices[i];
        if vertex.label == "withWorkdir" {
            working = cwd(&vertex.command)?;
            continue;
        }
        if selected.is_none()
            && (SKIP.contains(&vertex.label.as_str()) || vertex.command.is_empty())
        {
            continue;
        }
        let provider = vertex.runner.worker_spec()?;
        let activate_env = vertex.label == "useEnv";
        let output_path = root.join(format!("capture-{i}"));
        let mut lowered = if matches!(provider, Provider::Runner) && !activate_env {
            task(
                vertex.id.clone(),
                "bash".into(),
                vec!["-c".into(), vertex.command.clone()],
                working.clone(),
                &graph.environment,
            )
        } else {
            worker_task(
                graph,
                vertex.id.clone(),
                vec![Command {
                    provider: provider.clone(),
                    command: vertex.command.clone(),
                    cwd: working.clone(),
                    stderr: output == Output::Stderr,
                    capture: (!activate_env).then_some(output_path.clone()),
                    finalize: false,
                    activate_env,
                    started: None,
                }],
                root,
                &graph.environment,
            )?
        };
        if let Some(previous) = previous {
            lowered.needs.push(previous);
        }
        previous = Some(lowered.id.clone());
        if !activate_env {
            target = Some(lowered.id.clone());
            capture = (!matches!(provider, Provider::Runner)).then_some(output_path);
        }
        if selected.is_none() && vertex.label == "withCache" {
            let mut finalizer = worker_task(
                graph,
                format!("finalize-{}", vertex.id),
                vec![Command {
                    provider,
                    command: vertex.command.clone(),
                    cwd: working.clone(),
                    stderr: false,
                    capture: None,
                    finalize: true,
                    activate_env: false,
                    started: None,
                }],
                root,
                &graph.environment,
            )?;
            finalizer.timeout_ms = Some(cache_finalization_timeout(
                graph
                    .environment
                    .get("FLUENTCI_CACHE_FINALIZE_TIMEOUT_MS")
                    .map(String::as_str),
            )?);
            cleanup.push(finalizer);
        }
        tasks.push(lowered);
    }
    let mut compiled = plan(tasks);
    if selected.is_none() {
        let mut services = vec![];
        for service in &graph.enabled_services {
            let mut service_cwd = cwd(&service.working_dir)?;
            let mut commands = vec![];
            for vertex in &service.vertices {
                if vertex.label == "withWorkdir" {
                    service_cwd = cwd(&vertex.command)?;
                    continue;
                }
                if SKIP.contains(&vertex.label.as_str()) || vertex.command.is_empty() {
                    continue;
                }
                commands.push(Command {
                    provider: vertex.runner.worker_spec()?,
                    command: vertex.command.clone(),
                    cwd: service_cwd.clone(),
                    stderr: false,
                    capture: None,
                    finalize: false,
                    activate_env: vertex.label == "useEnv",
                    started: None,
                });
            }
            let marker = root.join(format!("service-{}.started", services.len()));
            commands
                .last_mut()
                .context("service has no command")?
                .started = Some(marker.clone());
            let mut lowered = worker_task(
                graph,
                format!("service-{}", service.id),
                commands,
                root,
                &graph.environment,
            )?;
            lowered.service = Some(fluentci_executor::service::Service {
                // Legacy APIs have no protocol probe. Preserve their startup grace
                // after the actual command starts; the kernel supervises liveness.
                readiness: fluentci_executor::service::Probe {
                    program: "/bin/sh".into(),
                    args: vec![
                        "-ec".into(),
                        "test -f \"$1\"; sleep 5".into(),
                        "readiness".into(),
                        marker.to_string_lossy().into_owned(),
                    ],
                    interval_ms: 250,
                    timeout_ms: 6_000,
                },
                health: Some(fluentci_executor::service::Probe {
                    program: "/bin/sh".into(),
                    args: vec![
                        "-ec".into(),
                        "test -f \"$1\"".into(),
                        "liveness".into(),
                        marker.to_string_lossy().into_owned(),
                    ],
                    interval_ms: 1_000,
                    timeout_ms: 1_000,
                }),
                startup_timeout_ms: 300_000,
                shutdown_timeout_ms: 5_000,
                failure_threshold: 3,
            });
            for task in &mut compiled.tasks {
                task.needs.push(lowered.id.clone());
            }
            services.push(lowered);
        }
        compiled.max_services = services.len().max(8);
        services.append(&mut compiled.tasks);
        compiled.tasks = services;
    }
    compiled.validate().map_err(Error::msg)?;
    Ok(Compiled {
        plan: compiled,
        cleanup: plan(cleanup),
        capture,
        target,
        final_cwd: working,
    })
}
#[derive(Default)]
struct Display {
    offset: u64,
    pending: Vec<u8>,
    lines: BTreeMap<(String, String), String>,
}
impl Display {
    fn line(text: &str) -> Result<(), Error> {
        let mut output = std::io::stdout().lock();
        output.write_all(text.strip_suffix('\r').unwrap_or(text).as_bytes())?;
        output.write_all(b"\n")?;
        output.flush()?;
        Ok(())
    }
    fn flush_task(&mut self, id: Option<&str>) -> Result<(), Error> {
        for ((task, _), text) in &mut self.lines {
            if id.is_none_or(|id| id == task.as_str()) && !text.is_empty() {
                Self::line(text)?;
                text.clear();
            }
        }
        Ok(())
    }
    fn poll(&mut self, path: &Path) -> Result<(), Error> {
        let mut file = match fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        };
        file.seek(SeekFrom::Start(self.offset))?;
        let count = file.read_to_end(&mut self.pending)?;
        self.offset += count as u64;
        while let Some(end) = self.pending.iter().position(|byte| *byte == b'\n') {
            let record: Vec<_> = self.pending.drain(..=end).collect();
            let event: fluentci_executor::events::Event = serde_json::from_slice(&record)?;
            match event.kind {
                fluentci_executor::events::EventKind::Log { id, stream, text }
                    if stream == "stdout" || stream == "stderr" =>
                {
                    let buffer = self.lines.entry((id, stream)).or_default();
                    buffer.push_str(&text);
                    while let Some(end) = buffer.find('\n') {
                        Self::line(&buffer[..end])?;
                        buffer.drain(..=end);
                    }
                }
                fluentci_executor::events::EventKind::TaskState {
                    id,
                    status:
                        fluentci_executor::Status::Succeeded
                        | fluentci_executor::Status::Failed
                        | fluentci_executor::Status::Skipped
                        | fluentci_executor::Status::Cancelled
                        | fluentci_executor::Status::TimedOut,
                    ..
                } => self.flush_task(Some(&id))?,
                fluentci_executor::events::EventKind::RunFinished { .. } => {
                    self.flush_task(None)?
                }
                _ => {}
            }
        }
        Ok(())
    }
}
pub(crate) fn run(
    plan: &Plan,
    directory: &Path,
    cancel: &Cancellation,
) -> Result<fluentci_executor::RunResult, Error> {
    thread::scope(|scope| {
        let context = opentelemetry::Context::current();
        let handle = scope.spawn(move || {
            let _context = context.attach();
            plan.execute(directory, cancel)
        });
        let mut display = Display::default();
        let journal = directory.join("events.jsonl");
        let mut display_error = None;
        loop {
            if display_error.is_none() {
                if let Err(error) = display.poll(&journal) {
                    cancel.cancel();
                    display_error = Some(error);
                }
            }
            if handle.is_finished() {
                let result = handle
                    .join()
                    .map_err(|_| anyhow!("executor worker panicked"))?
                    .map_err(Error::msg)?;
                if let Some(error) = display_error {
                    return Err(error);
                }
                display.poll(&journal)?;
                display.flush_task(None)?;
                return Ok(result);
            }
            thread::sleep(Duration::from_millis(10));
        }
    })
}
fn cache_finalization_timeout(value: Option<&str>) -> Result<u64, Error> {
    let milliseconds = value
        .map(str::parse::<u64>)
        .transpose()
        .context("FLUENTCI_CACHE_FINALIZE_TIMEOUT_MS must be an integer")?
        .unwrap_or(300_000);
    if !(1..=3_600_000).contains(&milliseconds) {
        bail!("FLUENTCI_CACHE_FINALIZE_TIMEOUT_MS must be in 1..=3600000");
    }
    Ok(milliseconds)
}
fn finalization_failure(task: &fluentci_executor::TaskResult) -> String {
    let status = task
        .exit_code
        .map(|code| format!("exit status {code}"))
        .unwrap_or_else(|| format!("{:?}", task.status).to_lowercase());
    let mut detail = task
        .error
        .clone()
        .unwrap_or_else(|| "provider finalizer failed".into());
    if let Ok(mut file) = fs::File::open(&task.stderr) {
        if let Ok(length) = file.metadata().map(|metadata| metadata.len()) {
            if file
                .seek(SeekFrom::Start(length.saturating_sub(4096)))
                .is_ok()
            {
                let mut tail = vec![];
                if file.take(4096).read_to_end(&mut tail).is_ok() && !tail.is_empty() {
                    detail.push_str(": ");
                    detail.push_str(String::from_utf8_lossy(&tail).trim());
                }
            }
        }
    }
    format!(
        "cache finalization failed for {} ({status}): {detail}",
        task.id
    )
}
pub(crate) fn execute(
    graph: &mut Graph,
    requested: Option<&str>,
    output: Output,
) -> Result<String, Error> {
    // Validation precedes request-file creation, service startup and provider setup.
    graph.execution_order()?;
    let root = tempfile::Builder::new()
        .prefix("fluentci-legacy-")
        .tempdir()?;
    let compiled = compile(graph, requested, output.clone(), root.path())?;
    let result = run(
        &compiled.plan,
        &root.path().join("run"),
        &graph.cancellation,
    );
    // Finalization is also executor-managed, including failure paths. Cancellation
    // deliberately prevents starting additional uploads after a user stops a run.
    if !compiled.cleanup.tasks.is_empty() && !graph.cancellation.is_cancelled() {
        let cleanup = run(
            &compiled.cleanup,
            &root.path().join("cleanup"),
            &graph.cancellation,
        );
        if result.as_ref().is_ok_and(|r| r.success()) {
            let cleanup = cleanup.context("cache finalization failed")?;
            if let Some(task) = cleanup
                .tasks
                .iter()
                .find(|task| task.status != fluentci_executor::Status::Succeeded)
            {
                let mut failure = cleanup.failure().expect("failed finalizer");
                failure.message = finalization_failure(task);
                return Err(failure.into());
            }
        }
    }

    let result = result?;
    if let Some(mut failure) = result.failure() {
        if let Some(task) = result.tasks.iter().find(|task| {
            !task.allowed_failure
                && matches!(
                    task.status,
                    fluentci_executor::Status::Failed
                        | fluentci_executor::Status::TimedOut
                        | fluentci_executor::Status::Cancelled
                )
        }) {
            let name = graph
                .vertices
                .iter()
                .find(|vertex| vertex.id == task.id)
                .map(|vertex| vertex.label.clone())
                .unwrap_or_else(|| task.id.clone());
            failure.message = format!("Command failed: {name}: {}", failure.message);
        }
        return Err(failure.into());
    }
    graph.work_dir = compiled.final_cwd.to_string_lossy().into_owned();
    let Some(target) = compiled.target else {
        return Ok(String::new());
    };
    if let Some(path) = compiled.capture {
        return Ok(fs::read_to_string(path)?);
    }
    let task = result
        .tasks
        .iter()
        .find(|task| task.id == target)
        .context("missing terminal task")?;
    let bytes = fs::read(if output == Output::Stderr {
        &task.stderr
    } else {
        &task.stdout
    })?;
    // Match legacy line capture, including its terminating newline.
    Ok(String::from_utf8_lossy(&bytes)
        .lines()
        .map(|line| format!("{line}\n"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deps::GraphCommand;
    use fluentci_ext::{runner::Runner, Extension};
    use std::sync::{mpsc, Arc};

    #[test]
    fn cache_finalization_timeout_is_bounded_configurable_and_not_thirty_seconds() {
        assert_eq!(cache_finalization_timeout(None).unwrap(), 300_000);
        assert_eq!(cache_finalization_timeout(Some("600000")).unwrap(), 600_000);
        for invalid in ["0", "-1", "invalid", "3600001"] {
            assert!(cache_finalization_timeout(Some(invalid)).is_err());
        }
    }

    fn graph(root: &Path) -> (Graph, mpsc::Receiver<(String, usize)>) {
        let (tx, rx) = mpsc::channel();
        let mut graph = Graph::new(tx, Arc::new(Box::new(Runner::default())));
        graph.work_dir = root.to_string_lossy().into_owned();
        (graph, rx)
    }
    fn add(graph: &mut Graph, id: &str, command: &str, needs: &[&str]) {
        graph
            .execute(GraphCommand::AddVertex(
                id.into(),
                "exec".into(),
                command.into(),
                needs.iter().map(|s| s.to_string()).collect(),
                Arc::new(Box::new(Runner::default())),
            ))
            .unwrap();
    }
    #[test]
    fn journal_display_handles_partial_records_and_terminal_output_without_newline() {
        let root = tempfile::tempdir().unwrap();
        let journal = root.path().join("events.jsonl");
        let log = serde_json::to_vec(&serde_json::json!({"sequence":1,"elapsed_ms":0,"type":"log", "id":"task", "stream":"stdout", "text":"without-newline"})).unwrap();
        let split = log.len() / 2;
        fs::write(&journal, &log[..split]).unwrap();
        let mut display = Display::default();
        display.poll(&journal).unwrap();
        assert!(display.lines.is_empty());
        let mut file = fs::OpenOptions::new().append(true).open(&journal).unwrap();
        file.write_all(&log[split..]).unwrap();
        file.write_all(b"\n").unwrap();
        display.poll(&journal).unwrap();
        assert_eq!(
            display
                .lines
                .get(&("task".into(), "stdout".into()))
                .unwrap(),
            "without-newline"
        );
        serde_json::to_writer(&mut file, &serde_json::json!({"sequence":2,"elapsed_ms":1,"type":"task_state", "id":"task", "status":"succeeded", "cache":"disabled", "reason":"", "duration_ms":1, "error":null})).unwrap();
        file.write_all(b"\n").unwrap();
        display.poll(&journal).unwrap();
        assert!(display.lines.values().all(String::is_empty));
        assert!(display.pending.is_empty());
    }

    #[test]
    fn diamond_preserves_legacy_order_and_terminal_capture() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, rx) = graph(root.path());
        add(&mut graph, "a", "printf a >> order", &[]);
        add(&mut graph, "b", "printf b >> order", &["a"]);
        add(&mut graph, "c", "printf c >> order", &["a"]);
        add(&mut graph, "d", "printf d >> order; cat order", &["b", "c"]);
        graph.execute_graph(Output::Stdout);
        assert_eq!(rx.recv().unwrap(), ("abcd\n".into(), 0));
        assert_eq!(
            fs::read_to_string(root.path().join("order")).unwrap(),
            "abcd"
        );
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn cycle_has_no_command_or_provider_effects() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, rx) = graph(root.path());
        add(&mut graph, "a", "touch unexpected", &["b"]);
        add(&mut graph, "b", "touch unexpected", &["a"]);
        graph.execute_graph(Output::Stdout);
        assert_eq!(rx.recv().unwrap().1, 1);
        assert!(!root.path().join("unexpected").exists());
        assert!(graph.execute_vertex("missing").is_err());
    }
    #[test]
    fn failed_step_stops_dependencies_and_completes_once() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, rx) = graph(root.path());
        add(
            &mut graph,
            "fail",
            "printf 'legacy process error' >&2; exit 7",
            &[],
        );
        add(&mut graph, "never", "touch unexpected", &["fail"]);
        graph.execute_graph(Output::Stdout);
        let (error, status) = rx.recv().unwrap();
        assert_eq!(status, 7);
        assert!(error.contains("exit code 7"), "{error}");
        assert!(error.contains("legacy process error"), "{error}");
        assert!(!root.path().join("unexpected").exists());
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn eager_utility_does_not_replay_pending_pipeline_commands() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, _) = graph(root.path());
        add(&mut graph, "pending", "touch unexpected", &[]);
        add(&mut graph, "utility", "printf queried", &["pending"]);
        assert_eq!(graph.execute_vertex("utility").unwrap(), "queried\n");
        assert!(!root.path().join("unexpected").exists());
    }
    #[test]
    fn environment_is_graph_local_and_stderr_capture_is_preserved() {
        let root = tempfile::tempdir().unwrap();
        let original = std::env::var("FLUENTCI_GRAPH_LOCAL_6821").ok();
        for value in ["first", "second"] {
            let (mut graph, rx) = graph(root.path());
            graph
                .execute(GraphCommand::AddEnvVariable(
                    "FLUENTCI_GRAPH_LOCAL_6821".into(),
                    value.into(),
                ))
                .unwrap();
            add(
                &mut graph,
                "print",
                "printf %s \"$FLUENTCI_GRAPH_LOCAL_6821\" >&2",
                &[],
            );
            graph.execute_graph(Output::Stderr);
            assert_eq!(rx.recv().unwrap(), (format!("{value}\n"), 0));
            assert_eq!(std::env::var("FLUENTCI_GRAPH_LOCAL_6821").ok(), original);
        }
    }
    #[test]
    fn empty_graph_completes_once() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, rx) = graph(root.path());
        graph.execute_graph(Output::Stdout);
        assert_eq!(rx.recv().unwrap(), (String::new(), 0));
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn provider_lowering_keeps_configuration_in_private_request_file() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, _) = graph(root.path());
        graph.vertices.push(crate::vertex::Vertex {
            id: "nix".into(),
            label: "exec".into(),
            command: "printf sensitive-command".into(),
            needs: vec![],
            runner: Arc::new(Box::new(fluentci_ext::nix::Nix::new(
                fluentci_types::nix::NixArgs { impure: true },
            ))),
        });
        let compiled = compile(&graph, None, Output::Stdout, root.path()).unwrap();
        let task = &compiled.plan.tasks[0];
        assert_eq!(task.args[0], "provider-worker");
        assert!(!task
            .args
            .iter()
            .any(|arg| arg.contains("sensitive-command")));
        let request: Request = serde_json::from_slice(&fs::read(&task.args[1]).unwrap()).unwrap();
        assert!(matches!(
            request.commands[0].provider,
            Provider::Nix { impure: true }
        ));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&task.args[1]).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    #[test]
    fn service_registration_is_pure_and_lowers_to_supervised_task() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, _) = graph(root.path());
        add(&mut graph, "daemon", "touch unexpected; sleep 100", &[]);
        graph
            .execute(GraphCommand::AddVertex(
                "service".into(),
                "asService".into(),
                "db".into(),
                vec!["daemon".into()],
                Arc::new(Box::new(Runner::default())),
            ))
            .unwrap();
        graph.register_service("service").unwrap();
        graph.reset();
        graph.work_dir = root.path().to_string_lossy().into_owned();
        graph
            .execute(GraphCommand::EnableService("service".into()))
            .unwrap();
        add(&mut graph, "client", "printf healthy", &[]);
        let compiled = compile(&graph, None, Output::Stdout, root.path()).unwrap();
        assert_eq!(compiled.plan.tasks.len(), 2);
        assert!(compiled.plan.tasks[0].service.is_some());
        assert_eq!(compiled.plan.tasks[1].needs, vec!["service-service"]);
        assert!(!root.path().join("unexpected").exists());
    }
    #[test]
    fn cancelling_legacy_execution_waits_for_kernel_cleanup() {
        let root = tempfile::tempdir().unwrap();
        let (mut graph, rx) = graph(root.path());
        add(
            &mut graph,
            "running",
            "echo started > started; exec sleep 100",
            &[],
        );
        let cancel = graph.cancellation.clone();
        thread::scope(|scope| {
            let execution = scope.spawn(|| graph.execute_graph(Output::Stdout));
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            while !root.path().join("started").exists() {
                assert!(
                    std::time::Instant::now() < deadline,
                    "command never started"
                );
                thread::sleep(Duration::from_millis(10));
            }
            cancel.cancel();
            assert!(cancel.wait_idle(Duration::from_secs(10)));
            execution.join().unwrap();
        });
        let (error, status) = rx.recv().unwrap();
        assert_eq!(status, 130);
        assert!(error.contains("cancel"), "{error}");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn every_builtin_provider_has_a_serializable_descriptor() {
        let providers: Vec<Box<dyn Extension>> = vec![
            Box::new(Runner::default()),
            Box::new(fluentci_ext::nix::Nix::default()),
            Box::new(fluentci_ext::flox::Flox::default()),
            Box::new(fluentci_ext::devbox::Devbox::default()),
            Box::new(fluentci_ext::envhub::Envhub::default()),
            Box::new(fluentci_ext::cache::Cache::default()),
            Box::new(fluentci_ext::bsd::BsdPackages::netbsd()),
            Box::new(fluentci_ext::macports::MacPorts::default()),
        ];
        for provider in providers {
            let descriptor = provider.worker_spec().unwrap();
            let wire = serde_json::to_vec(&descriptor).unwrap();
            let _: Provider = serde_json::from_slice(&wire).unwrap();
        }
    }
}
