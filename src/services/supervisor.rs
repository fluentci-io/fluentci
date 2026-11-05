//! Unix service supervisor. Owns children and their process groups for their lifetime.

use super::{
    Request, Response, Status,
    definition::{self, Backend, Definition, Probe, Restart},
    runtime_directory, state_directory,
};
use anyhow::{Context, Result};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::File,
    io::Write,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{UnixListener, UnixStream},
    process::{Child, Command},
    sync::Mutex,
};

struct Log {
    path: PathBuf,
    file: File,
    bytes: u64,
    limit: u64,
}

impl Log {
    fn open(path: PathBuf, limit: u64) -> Result<Self> {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        let bytes = file.metadata()?.len();
        Ok(Self {
            path,
            file,
            bytes,
            limit,
        })
    }
    fn write(&mut self, bytes: &[u8]) -> Result<()> {
        if self.bytes > 0 && self.bytes + bytes.len() as u64 > self.limit {
            for index in (1..=2).rev() {
                let source = self.path.with_extension(format!("log.{index}"));
                if source.exists() {
                    std::fs::rename(
                        &source,
                        self.path.with_extension(format!("log.{}", index + 1)),
                    )?;
                }
            }
            std::fs::rename(&self.path, self.path.with_extension("log.1"))?;
            self.file = File::create(&self.path)?;
            self.bytes = 0;
        }
        self.file.write_all(bytes)?;
        self.file.flush()?;
        self.bytes += bytes.len() as u64;
        Ok(())
    }
}

fn pump(
    stream: impl AsyncRead + Unpin + Send + 'static,
    log: Arc<Mutex<Log>>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut stream = stream;
        let mut bytes = [0; 8192];
        loop {
            match stream.read(&mut bytes).await {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    if log.lock().await.write(&bytes[..count]).is_err() {
                        break;
                    }
                }
            }
        }
    })
}

struct Worker {
    definition: Definition,
    child: Option<Child>,
    state: Status,
    desired: bool,
    next_start: Instant,
    last_health: Instant,
    health_failures: u32,
    container: String,
    log: Arc<Mutex<Log>>,
    pumps: Vec<tokio::task::JoinHandle<()>>,
    runtime_env: BTreeMap<String, String>,
}

struct Manager {
    root: PathBuf,
    workers: BTreeMap<String, Worker>,
    order: Vec<String>,
    shutdown: Arc<AtomicBool>,
    leases: BTreeMap<String, BTreeSet<String>>,
    scoped: BTreeSet<String>,
    manual: BTreeSet<String>,
}

fn signal_group(pid: u32, signal: i32) {
    if pid > 1 {
        unsafe {
            libc::kill(-(pid as i32), signal);
        }
    }
}

fn expand(input: &str, ports: &BTreeMap<String, String>) -> String {
    let mut result = input.to_owned();
    for (port, address) in ports {
        result = result.replace(
            &format!("${{port:{}}}", port.trim_end_matches("/tcp")),
            address,
        );
    }
    result
}

impl Manager {
    fn new(root: &Path, shutdown: Arc<AtomicBool>) -> Self {
        Self {
            root: root.into(),
            workers: BTreeMap::new(),
            order: vec![],
            shutdown,
            leases: BTreeMap::new(),
            scoped: BTreeSet::new(),
            manual: BTreeSet::new(),
        }
    }

    async fn apply(&mut self, definitions: Vec<Definition>) -> Result<()> {
        let mut combined: BTreeMap<_, _> = self
            .workers
            .iter()
            .map(|(name, worker)| (name.clone(), worker.definition.clone()))
            .collect();
        for definition in &definitions {
            if let Some(worker) = self.workers.get(&definition.name) {
                anyhow::ensure!(
                    worker.child.is_none()
                        || serde_json::to_value(&worker.definition)?
                            == serde_json::to_value(definition)?,
                    "Stop {:?} before changing its definition",
                    definition.name
                );
            }
            combined.insert(definition.name.clone(), definition.clone());
        }
        let all: Vec<_> = combined.into_values().collect();
        let order = definition::validate(&all)?;
        for definition in definitions {
            if self
                .workers
                .get(&definition.name)
                .is_some_and(|worker| worker.child.is_some())
            {
                continue;
            }
            let log = Arc::new(Mutex::new(Log::open(
                state_directory(&self.root).join(format!("{}.log", definition.name)),
                definition.log_max_bytes,
            )?));
            let container = format!(
                "fluentci-{}-{}-{}",
                &sha256::digest(self.root.to_string_lossy().as_bytes())[..12],
                definition.name,
                uuid::Uuid::new_v4().simple()
            );
            let state = Status::stopped(&definition);
            self.workers.insert(
                definition.name.clone(),
                Worker {
                    definition,
                    child: None,
                    state,
                    desired: false,
                    next_start: Instant::now(),
                    last_health: Instant::now(),
                    health_failures: 0,
                    container,
                    log,
                    pumps: vec![],
                    runtime_env: BTreeMap::new(),
                },
            );
        }
        self.order = order;
        Ok(())
    }

    fn command(root: &Path, worker: &Worker, argv: Vec<String>) -> Result<Command> {
        let (program, args) = argv.split_first().context("Empty service command")?;
        let mut command = Command::new(program);
        command.args(args);
        command
            .current_dir(
                worker
                    .definition
                    .working_directory
                    .as_ref()
                    .map_or_else(|| root.to_path_buf(), |path| root.join(path)),
            )
            .envs(&worker.runtime_env)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .process_group(0);
        Ok(command)
    }

    async fn probe(root: &Path, worker: &Worker, probe: &Probe) -> bool {
        match probe {
            Probe::Tcp { address } => matches!(
                tokio::time::timeout(
                    Duration::from_secs(2),
                    tokio::net::TcpStream::connect(expand(address, &worker.state.ports))
                )
                .await,
                Ok(Ok(_))
            ),
            Probe::Http { url, status } => crate::registry::client()
                .get(expand(url, &worker.state.ports))
                .timeout(Duration::from_secs(2))
                .send()
                .await
                .is_ok_and(|response| response.status().as_u16() == *status),
            Probe::Exec { command } => {
                let args = command
                    .iter()
                    .map(|arg| expand(arg, &worker.state.ports))
                    .collect::<Vec<_>>();
                let argv = if worker.definition.backend == Backend::Docker {
                    let mut argv = vec!["docker".into(), "exec".into(), worker.container.clone()];
                    argv.extend(args);
                    argv
                } else {
                    worker.definition.argv(&worker.container, Some(args))
                };
                let Ok(mut command) = Self::command(root, worker, argv) else {
                    return false;
                };
                command.stdout(Stdio::null()).stderr(Stdio::null());
                let Ok(mut child) = command.spawn() else {
                    return false;
                };
                let pid = child.id();
                let result = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
                if let Some(pid) = pid {
                    signal_group(pid, libc::SIGKILL);
                }
                matches!(result,Ok(Ok(status)) if status.success())
            }
        }
    }

    async fn docker_cleanup(worker: &Worker) {
        if worker.definition.backend != Backend::Docker {
            return;
        }
        let _ = tokio::time::timeout(
            Duration::from_secs(10),
            Command::new("docker")
                .args(["rm", "--force", &worker.container])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .status(),
        )
        .await;
    }

    async fn stop(&mut self, name: &str, desired: bool) -> Result<()> {
        let worker = self.workers.get_mut(name).context("Unknown service")?;
        worker.desired = desired;
        if let Some(mut child) = worker.child.take() {
            worker.state.state = "stopping".into();
            if worker.definition.backend == Backend::Docker {
                let seconds = worker.definition.stop_timeout_ms.div_ceil(1000).to_string();
                let _ = tokio::time::timeout(
                    Duration::from_millis(worker.definition.stop_timeout_ms + 2000),
                    Command::new("docker")
                        .args(["stop", "--time", &seconds, &worker.container])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .kill_on_drop(true)
                        .status(),
                )
                .await;
            }
            let pid = child.id();
            if let Some(pid) = pid {
                signal_group(pid, libc::SIGTERM);
            }
            if tokio::time::timeout(
                Duration::from_millis(worker.definition.stop_timeout_ms),
                child.wait(),
            )
            .await
            .is_err()
            {
                if let Some(pid) = pid {
                    signal_group(pid, libc::SIGKILL);
                }
                let _ = child.wait().await;
            }
            if let Some(pid) = pid {
                signal_group(pid, libc::SIGKILL);
            }
        }
        Self::docker_cleanup(worker).await;
        for task in worker.pumps.drain(..) {
            let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
        }
        worker.state.pid = None;
        worker.state.state = if desired { "waiting" } else { "stopped" }.into();
        worker.log.lock().await.write(b"\n[fluentci] stopped\n")?;
        Ok(())
    }

    async fn start(&mut self, name: &str) -> Result<()> {
        let dependency_ports: Vec<_> = self
            .workers
            .iter()
            .flat_map(|(name, worker)| {
                worker.state.ports.iter().map(move |(port, address)| {
                    (
                        format!(
                            "${{services.{name}.ports.{}}}",
                            port.trim_end_matches("/tcp")
                        ),
                        address.clone(),
                    )
                })
            })
            .collect();
        let worker = self.workers.get_mut(name).context("Unknown service")?;
        if worker.child.is_some() {
            worker.desired = true;
            return Ok(());
        }
        worker.desired = true;
        worker.state.state = "starting".into();
        worker.state.message = None;
        worker.state.exit_code = None;
        worker.runtime_env = worker.definition.env.clone();
        for value in worker.runtime_env.values_mut() {
            for (key, address) in &dependency_ports {
                *value = value.replace(key, address);
            }
        }
        let result = Self::start_worker(&self.root, worker, &self.shutdown).await;
        if let Err(error) = &result {
            worker.state.message = Some(error.to_string());
        }
        result
    }

    async fn start_worker(root: &Path, worker: &mut Worker, shutdown: &AtomicBool) -> Result<()> {
        let deadline = Instant::now() + Duration::from_millis(worker.definition.startup_timeout_ms);
        worker.log.lock().await.write(b"\n[fluentci] starting\n")?;
        if let Some(setup) = &worker.definition.setup {
            let mut command = Self::command(
                root,
                worker,
                worker
                    .definition
                    .argv(&worker.container, Some(setup.argv())),
            )?;
            let mut child = command.spawn().context("Starting service setup")?;
            if let Some(stdout) = child.stdout.take() {
                worker.pumps.push(pump(stdout, worker.log.clone()));
            }
            if let Some(stderr) = child.stderr.take() {
                worker.pumps.push(pump(stderr, worker.log.clone()));
            }
            let setup_pid = child.id();
            loop {
                if let Some(status) = child.try_wait()? {
                    if let Some(pid) = setup_pid {
                        signal_group(pid, libc::SIGKILL);
                    }
                    anyhow::ensure!(status.success(), "Service setup failed: {status}");
                    break;
                }
                if shutdown.load(Ordering::SeqCst) || Instant::now() >= deadline {
                    if let Some(pid) = child.id() {
                        signal_group(pid, libc::SIGKILL);
                    }
                    let _ = child.wait().await;
                    anyhow::bail!("Service setup timed out or was cancelled");
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
        let mut command = Self::command(
            root,
            worker,
            worker.definition.argv(&worker.container, None),
        )?;
        let mut child = command.spawn().with_context(|| {
            format!(
                "Starting {:?} with {:?} backend",
                worker.definition.name, worker.definition.backend
            )
        })?;
        worker.state.pid = child.id();
        if let Some(stdout) = child.stdout.take() {
            worker.pumps.push(pump(stdout, worker.log.clone()));
        }
        if let Some(stderr) = child.stderr.take() {
            worker.pumps.push(pump(stderr, worker.log.clone()));
        }
        worker.child = Some(child);
        loop {
            anyhow::ensure!(
                !shutdown.load(Ordering::SeqCst),
                "Service startup cancelled"
            );
            if let Some(status) = worker.child.as_mut().unwrap().try_wait()? {
                worker.state.exit_code = status.code();
                anyhow::bail!("Service exited before becoming ready: {status}");
            }
            if worker.definition.backend == Backend::Docker
                && let Ok(Ok(output)) = tokio::time::timeout(
                    Duration::from_secs(2),
                    Command::new("docker")
                        .args(["port", &worker.container])
                        .kill_on_drop(true)
                        .output(),
                )
                .await
                && output.status.success()
            {
                worker.state.ports = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter_map(|line| line.split_once(" -> "))
                    .map(|(key, value)| (key.into(), value.into()))
                    .collect();
            }
            let ready = match &worker.definition.readiness {
                Some(probe) => Self::probe(root, worker, probe).await,
                None => {
                    worker.definition.backend != Backend::Docker
                        || matches!(tokio::time::timeout(Duration::from_secs(2),Command::new("docker").args(["inspect","--format","{{.State.Running}}",&worker.container]).kill_on_drop(true).output()).await,Ok(Ok(output)) if output.status.success() && String::from_utf8_lossy(&output.stdout).trim()=="true")
                }
            };
            if ready {
                worker.state.state = if worker.definition.readiness.is_some() {
                    "ready"
                } else {
                    "running"
                }
                .into();
                worker.last_health = Instant::now();
                worker.health_failures = 0;
                return Ok(());
            }
            anyhow::ensure!(Instant::now() < deadline, "Service readiness timed out");
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    fn targets(&self, requested: &[String]) -> Result<Vec<String>> {
        let mut required = BTreeSet::new();
        fn collect(
            name: &str,
            workers: &BTreeMap<String, Worker>,
            output: &mut BTreeSet<String>,
        ) -> Result<()> {
            let worker = workers
                .get(name)
                .with_context(|| format!("Unknown service {name:?}"))?;
            if output.insert(name.into()) {
                for dependency in &worker.definition.depends_on {
                    collect(dependency, workers, output)?;
                }
            }
            Ok(())
        }
        for name in requested {
            collect(name, &self.workers, &mut required)?;
        }
        Ok(self
            .order
            .iter()
            .filter(|name| requested.is_empty() || required.contains(*name))
            .cloned()
            .collect())
    }

    async fn up(&mut self, requested: &[String]) -> Result<Vec<String>> {
        let targets = self.targets(requested)?;
        let mut started = vec![];
        for name in targets {
            if self.workers[&name].child.is_some() {
                continue;
            }
            self.workers.get_mut(&name).unwrap().state.restarts = 0;
            started.push(name.clone());
            if let Err(error) = self.start(&name).await {
                for name in started.iter().rev() {
                    let _ = self.stop(name, false).await;
                }
                self.workers.get_mut(&name).unwrap().state.state = "failed".into();
                return Err(error);
            }
        }
        Ok(started)
    }

    fn dependents(&self, names: &[String]) -> Vec<String> {
        let mut selected: BTreeSet<_> = names.iter().cloned().collect();
        loop {
            let before = selected.len();
            for (name, worker) in &self.workers {
                if worker
                    .definition
                    .depends_on
                    .iter()
                    .any(|dependency| selected.contains(dependency))
                {
                    selected.insert(name.clone());
                }
            }
            if selected.len() == before {
                break;
            }
        }
        self.order
            .iter()
            .filter(|name| selected.contains(*name))
            .cloned()
            .collect()
    }

    async fn tick(&mut self) {
        let order = self.order.clone();
        for name in order {
            let dependencies_ready = self.workers[&name]
                .definition
                .depends_on
                .iter()
                .all(|name| {
                    self.workers[name].child.is_some()
                        && matches!(self.workers[name].state.state.as_str(), "running" | "ready")
                });
            if !dependencies_ready && self.workers[&name].child.is_some() {
                let _ = self.stop(&name, true).await;
                continue;
            }
            let worker = self.workers.get_mut(&name).unwrap();
            if let Some(child) = &mut worker.child {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        if let Some(pid) = worker.state.pid {
                            signal_group(pid, libc::SIGKILL);
                        }
                        worker.child = None;
                        worker.state.pid = None;
                        worker.state.exit_code = status.code();
                        worker.state.state = "exited".into();
                        Self::docker_cleanup(worker).await;
                        let restart = worker.definition.restart == Restart::Always
                            || worker.definition.restart == Restart::OnFailure && !status.success();
                        worker.desired &= restart;
                        worker.next_start = Instant::now()
                            + Duration::from_millis(
                                worker
                                    .definition
                                    .restart_backoff_ms
                                    .saturating_mul(1_u64 << worker.state.restarts.min(7))
                                    .min(30_000),
                            );
                    }
                    Err(error) => {
                        worker.state.message = Some(error.to_string());
                        worker.desired = false;
                    }
                    _ => {}
                }
            }
            if worker.child.is_some() && worker.last_health.elapsed() >= Duration::from_secs(1) {
                worker.last_health = Instant::now();
                if let Some(probe) = &worker.definition.health {
                    if Self::probe(&self.root, worker, probe).await {
                        worker.health_failures = 0;
                    } else {
                        worker.health_failures += 1;
                    }
                }
            }
            let unhealthy = worker.health_failures >= 3;
            if unhealthy {
                let _ = self.stop(&name, true).await;
                let worker = self.workers.get_mut(&name).unwrap();
                worker.state.state = "unhealthy".into();
                worker.desired = worker.definition.restart != Restart::Never;
            }
            let worker = &self.workers[&name];
            if worker.desired
                && worker.child.is_none()
                && dependencies_ready
                && Instant::now() >= worker.next_start
            {
                if worker.state.state != "waiting"
                    && worker.state.restarts >= worker.definition.max_restarts
                {
                    self.workers.get_mut(&name).unwrap().desired = false;
                    self.workers.get_mut(&name).unwrap().state.state = "failed".into();
                    continue;
                }
                self.workers.get_mut(&name).unwrap().state.restarts += 1;
                if let Err(error) = self.start(&name).await {
                    let _ = self.stop(&name, true).await;
                    let worker = self.workers.get_mut(&name).unwrap();
                    worker.state.message = Some(error.to_string());
                    worker.state.state = "failed".into();
                    worker.next_start = Instant::now()
                        + Duration::from_millis(worker.definition.restart_backoff_ms);
                }
            }
        }
    }

    fn statuses(&self) -> Vec<Status> {
        self.workers
            .values()
            .map(|worker| worker.state.clone())
            .collect()
    }

    async fn request(&mut self, request: Request) -> Result<Response> {
        if !request.definitions.is_empty() {
            self.apply(request.definitions).await?;
        }
        let mut changed = vec![];
        match request.operation.as_str() {
            "up" | "start" => {
                changed = self.up(&request.names).await?;
                self.manual.extend(self.targets(&request.names)?);
            }
            "acquire" => {
                let token = request.token.context("Missing service lease token")?;
                let targets = self.targets(&request.names)?;
                changed = self.up(&request.names).await?;
                self.scoped.extend(changed.clone());
                for name in targets {
                    self.leases.entry(name).or_default().insert(token.clone());
                }
            }
            "release" => {
                let token = request.token.context("Missing service lease token")?;
                for leases in self.leases.values_mut() {
                    leases.remove(&token);
                }
                for name in self.order.clone().into_iter().rev() {
                    if self.scoped.contains(&name)
                        && !self.manual.contains(&name)
                        && self.leases.get(&name).is_none_or(BTreeSet::is_empty)
                    {
                        self.stop(&name, false).await?;
                        self.scoped.remove(&name);
                    }
                }
            }
            "stop" | "down" | "restart" => {
                let names = if request.names.is_empty() {
                    self.order.clone()
                } else {
                    for name in &request.names {
                        anyhow::ensure!(self.workers.contains_key(name), "Unknown service {name}");
                    }
                    self.dependents(&request.names)
                };
                let restart: Vec<_> = names
                    .iter()
                    .filter(|name| self.workers[*name].desired || request.names.contains(*name))
                    .cloned()
                    .collect();
                for name in names.iter().rev() {
                    self.stop(name, false).await?;
                    self.manual.remove(name);
                    self.scoped.remove(name);
                }
                if request.operation == "restart" {
                    changed = self.up(&restart).await?;
                    self.manual.extend(restart);
                }
            }
            "status" | "apply" => {}
            _ => anyhow::bail!("Unknown service operation"),
        }
        if request.operation == "release"
            && self.manual.is_empty()
            && self.leases.values().all(BTreeSet::is_empty)
        {
            self.shutdown.store(true, Ordering::SeqCst);
        }
        Ok(Response {
            ok: true,
            error: None,
            services: self.statuses(),
            started: changed,
        })
    }
}

async fn send(stream: &mut UnixStream, response: &Response) -> Result<()> {
    let mut bytes = serde_json::to_vec(response)?;
    bytes.push(b'\n');
    stream.write_all(&bytes).await?;
    Ok(())
}

pub async fn run(root: &Path) -> Result<()> {
    let directory = state_directory(root);
    std::fs::create_dir_all(&directory)?;
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join("manager.lock"))?;
    lock.try_lock()
        .context("A service manager is already running")?;
    let socket = runtime_directory(root)?.join("manager.sock");
    if socket.exists() {
        std::fs::remove_file(&socket)?;
    }
    let listener = UnixListener::bind(&socket)?;
    std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
    let shutdown = Arc::new(AtomicBool::new(false));
    let cancelled = shutdown.clone();
    tokio::spawn(async move {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM handler");
        tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}}
        cancelled.store(true, Ordering::SeqCst);
    });
    let mut manager = Manager::new(root, shutdown.clone());
    manager.apply(definition::discover(root)?).await?;
    let mut interval = tokio::time::interval(Duration::from_millis(100));
    loop {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            _=interval.tick()=>manager.tick().await,
            connection=listener.accept()=>{
                let (stream,_)=connection?;let mut reader=BufReader::new(stream.take(1024*1024+1));let mut line=String::new();
                let request=tokio::time::timeout(Duration::from_secs(5),reader.read_line(&mut line)).await;
                let stream=reader.into_inner().into_inner();let mut stream=stream;
                let result=match request {Ok(Ok(_)) if line.len()<=1024*1024=>match serde_json::from_str::<Request>(&line){Ok(request)=>{let down=request.operation=="down" && request.names.is_empty();let result=manager.request(request).await;if down && result.is_ok(){shutdown.store(true,Ordering::SeqCst);}result},Err(error)=>Err(error.into())},_=>Err(anyhow::anyhow!("Invalid or timed-out service request"))};
                let response=result.unwrap_or_else(|error|Response{ok:false,error:Some(error.to_string()),services:manager.statuses(),started:vec![]});let _=send(&mut stream,&response).await;
            }
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(&manager.statuses()) {
            let _ = std::fs::write(directory.join("status.json"), bytes);
        }
    }
    for name in manager.order.clone().into_iter().rev() {
        let _ = manager.stop(&name, false).await;
    }
    std::fs::write(
        directory.join("status.json"),
        serde_json::to_vec_pretty(&manager.statuses())?,
    )?;
    let _ = std::fs::remove_file(socket);
    Ok(())
}
