//! Built-in, workspace-scoped service supervision and its portable JSON client.

pub mod definition;
#[cfg(unix)]
mod supervisor;

use anyhow::{Context, Result};
use definition::{Backend, Definition};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, AsyncWriteExt, BufReader};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Status {
    pub name: String,
    pub backend: Backend,
    pub state: String,
    pub pid: Option<u32>,
    pub restarts: u32,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
    pub ports: BTreeMap<String, String>,
}

impl Status {
    fn stopped(definition: &Definition) -> Self {
        Self {
            name: definition.name.clone(),
            backend: definition.backend,
            state: "stopped".into(),
            pid: None,
            restarts: 0,
            exit_code: None,
            message: None,
            ports: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub operation: String,
    #[serde(default)]
    pub names: Vec<String>,
    #[serde(default)]
    pub definitions: Vec<Definition>,
    #[serde(default)]
    pub token: Option<String>,
}

impl Request {
    fn new(operation: &str, names: Vec<String>) -> Self {
        Self {
            operation: operation.into(),
            names,
            definitions: vec![],
            token: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub ok: bool,
    pub error: Option<String>,
    pub services: Vec<Status>,
    pub started: Vec<String>,
}

pub fn state_directory(root: &Path) -> PathBuf {
    root.join(".fluentci/services")
}

#[cfg(unix)]
fn runtime_directory(root: &Path) -> Result<PathBuf> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let uid = unsafe { libc::geteuid() };
    let parent = PathBuf::from(format!("/tmp/fluentci-services-{uid}"));
    match std::fs::create_dir(&parent) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.into()),
    }
    let metadata = std::fs::symlink_metadata(&parent)?;
    anyhow::ensure!(
        metadata.is_dir() && !metadata.file_type().is_symlink() && metadata.uid() == uid,
        "Unsafe service socket directory"
    );
    std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o700))?;
    let root = root.canonicalize()?;
    let directory = parent.join(&sha256::digest(root.to_string_lossy().as_bytes())[..24]);
    std::fs::create_dir_all(&directory)?;
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
    Ok(directory)
}

#[cfg(unix)]
pub async fn request(root: &Path, request: &Request) -> Result<Response> {
    let mut socket =
        tokio::net::UnixStream::connect(runtime_directory(root)?.join("manager.sock")).await?;
    let mut bytes = serde_json::to_vec(request)?;
    anyhow::ensure!(
        bytes.len() <= 1024 * 1024,
        "Service definition payload exceeds 1 MiB"
    );
    bytes.push(b'\n');
    socket.write_all(&bytes).await?;
    let mut line = String::new();
    tokio::time::timeout(
        Duration::from_secs(600),
        BufReader::new(socket.take(4 * 1024 * 1024)).read_line(&mut line),
    )
    .await??;
    let response: Response =
        serde_json::from_str(&line).context("Invalid service manager response")?;
    anyhow::ensure!(
        response.ok,
        "{}",
        response
            .error
            .as_deref()
            .unwrap_or("Service operation failed")
    );
    Ok(response)
}

#[cfg(not(unix))]
pub async fn request(_root: &Path, _request: &Request) -> Result<Response> {
    anyhow::bail!("Built-in services require a POSIX Unix platform")
}

async fn ensure(root: &Path) -> Result<()> {
    if request(root, &Request::new("status", vec![])).await.is_ok() {
        return Ok(());
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let directory = state_directory(root);
        std::fs::create_dir_all(&directory)?;
        let log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("manager.log"))?;
        let mut command = std::process::Command::new(crate::process::current_exe()?);
        command
            .args(["__service-manager", "--root"])
            .arg(root)
            .current_dir(root)
            .stdin(Stdio::null())
            .stdout(log.try_clone()?)
            .stderr(log);
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(())
                }
            });
        }
        let mut child = command
            .spawn()
            .context("Starting built-in service manager")?;
        for _ in 0..200 {
            if request(root, &Request::new("status", vec![])).await.is_ok() {
                drop(child);
                return Ok(());
            }
            if let Some(status) = child.try_wait()? {
                anyhow::bail!(
                    "Service manager exited ({status}); see {}",
                    directory.join("manager.log").display()
                );
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        anyhow::bail!(
            "Service manager startup timed out; see {}",
            directory.join("manager.log").display()
        );
    }
    #[cfg(not(unix))]
    anyhow::bail!("Built-in services require a POSIX Unix platform")
}

pub async fn daemon(root: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        supervisor::run(&root.canonicalize()?).await
    }
    #[cfg(not(unix))]
    {
        let _ = root;
        anyhow::bail!("Built-in services require a POSIX Unix platform")
    }
}

pub async fn apply(root: &Path, definitions: Vec<Definition>) -> Result<Response> {
    for definition in &definitions {
        definition.validate()?;
    }
    ensure(root).await?;
    let names = definitions
        .iter()
        .map(|definition| definition.name.clone())
        .collect();
    request(
        root,
        &Request {
            operation: "up".into(),
            names,
            definitions,
            token: None,
        },
    )
    .await
}

pub async fn status(root: &Path) -> Result<Vec<Status>> {
    if let Ok(response) = request(root, &Request::new("status", vec![])).await {
        return Ok(response.services);
    }
    Ok(definition::discover(root)?
        .iter()
        .map(Status::stopped)
        .collect())
}

pub async fn control(operation: &str, name: Option<&str>) -> Result<()> {
    let root = crate::workspace::Workspace::current()?.root;
    if operation == "echo" {
        return logs(&root, name.context("Specify a service")?, true, 200).await;
    }
    if operation == "ps" || operation == "status" {
        let statuses = status(&root).await?;
        if let Some(name) = name {
            anyhow::ensure!(
                statuses.iter().any(|status| status.name == name),
                "Unknown service {name}"
            );
        }
        println!("SERVICE\tPID\tSTATUS\tRESTARTS\tPORTS");
        for status in statuses
            .iter()
            .filter(|status| name.is_none_or(|name| name == status.name))
        {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                status.name,
                status
                    .pid
                    .map(|pid| pid.to_string())
                    .unwrap_or_else(|| "-".into()),
                status.state,
                status.restarts,
                serde_json::to_string(&status.ports)?
            );
        }
        return Ok(());
    }
    if operation == "up" || operation == "start" || operation == "restart" {
        ensure(&root).await?;
    }
    let response = request(
        &root,
        &Request::new(operation, name.into_iter().map(str::to_owned).collect()),
    )
    .await;
    if response.is_err()
        && operation == "down"
        && request(&root, &Request::new("status", vec![]))
            .await
            .is_err()
    {
        println!("No services running");
        return Ok(());
    }
    for service in response?.services {
        println!("{}: {}", service.name, service.state);
    }
    Ok(())
}

pub async fn logs(root: &Path, name: &str, follow: bool, tail: usize) -> Result<()> {
    anyhow::ensure!(
        !name.is_empty()
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_')),
        "Invalid service name"
    );
    let path = state_directory(root).join(format!("{name}.log"));
    let mut file = tokio::fs::File::open(&path)
        .await
        .with_context(|| format!("No logs for {name}"))?;
    let length = file.metadata().await?.len();
    let start = length.saturating_sub(1024 * 1024);
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let mut bytes = vec![];
    file.read_to_end(&mut bytes).await?;
    let text = String::from_utf8_lossy(&bytes);
    let lines = text.lines().collect::<Vec<_>>();
    let mut stdout = tokio::io::stdout();
    for line in lines.iter().skip(lines.len().saturating_sub(tail)) {
        stdout.write_all(line.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
    }
    stdout.flush().await?;
    if !follow {
        return Ok(());
    }
    let mut offset = length;
    let mut buffer = [0; 8192];
    loop {
        tokio::select! {_=tokio::signal::ctrl_c()=>return Ok(()),_=tokio::time::sleep(Duration::from_millis(100))=>{}}
        // Reopen by path so rotation is followed even when the new file is larger.
        let mut current = tokio::fs::File::open(&path).await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if current.metadata().await?.ino() != file.metadata().await?.ino() {
                offset = 0;
            }
        }
        if current.metadata().await?.len() < offset {
            offset = 0;
        }
        current.seek(std::io::SeekFrom::Start(offset)).await?;
        loop {
            let count = current.read(&mut buffer).await?;
            if count == 0 {
                break;
            }
            stdout.write_all(&buffer[..count]).await?;
            offset += count as u64;
        }
        stdout.flush().await?;
        file = current;
    }
}

pub async fn scoped(root: &Path, names: Vec<String>, arguments: Vec<String>) -> Result<()> {
    let (program, args) = arguments
        .split_first()
        .context("Specify a command after --")?;
    ensure(root).await?;
    let token = uuid::Uuid::new_v4().to_string();
    let mut acquire = Request::new("acquire", names);
    acquire.token = Some(token.clone());
    let acquired = request(root, &acquire).await?;
    let mut command = tokio::process::Command::new(program);
    command.args(args).current_dir(root).kill_on_drop(true);
    command.env(
        "FLUENTCI_SERVICES",
        serde_json::to_string(&acquired.services)?,
    );
    for service in &acquired.services {
        for (port, address) in &service.ports {
            let prefix = format!(
                "FLUENTCI_SERVICE_{}",
                service.name.to_ascii_uppercase().replace('-', "_")
            );
            let port = port.trim_end_matches("/tcp");
            command.env(format!("{prefix}_ADDRESS_{port}"), address);
            if let Some((host, value)) = address.rsplit_once(':') {
                command
                    .env(format!("{prefix}_HOST_{port}"), host)
                    .env(format!("{prefix}_PORT_{port}"), value);
            }
        }
    }
    #[cfg(unix)]
    command.process_group(0);
    let result=async {
        let mut child=command.spawn().context("Starting scoped command")?;
        tokio::select! {
            status=child.wait()=>Ok(status?),
            _=tokio::signal::ctrl_c()=>{
                #[cfg(unix)] if let Some(pid)=child.id(){unsafe{libc::kill(-(pid as i32),libc::SIGINT);}}
                match tokio::time::timeout(Duration::from_secs(5),child.wait()).await{Ok(status)=>Ok(status?),Err(_)=>{#[cfg(unix)] if let Some(pid)=child.id(){unsafe{libc::kill(-(pid as i32),libc::SIGKILL);}}let _=child.kill().await;anyhow::bail!("Scoped command cancelled");}}
            }
        }
    }.await;
    let mut release = Request::new("release", vec![]);
    release.token = Some(token);
    let cleanup = request(root, &release).await;
    let status: std::process::ExitStatus = result?;
    cleanup?;
    if !status.success() {
        return Err(crate::process::Failure {
            program: "scoped service command".into(),
            status,
        }
        .into());
    }
    Ok(())
}
