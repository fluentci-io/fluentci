//! Overmind's local Unix socket protocol.

use anyhow::{Context, Result};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Service {
    command: String,
    socket: PathBuf,
}

fn discover() -> Result<BTreeMap<String, Service>> {
    let mut services = BTreeMap::new();
    let Ok(dirs) = std::fs::read_dir(".fluentci") else {
        return Ok(services);
    };
    for dir in dirs {
        let path = dir?.path().join("Procfile");
        if !path.is_file() {
            continue;
        }
        for line in std::fs::read_to_string(&path)?
            .lines()
            .filter(|l| !l.trim().starts_with('#'))
        {
            if let Some((name, command)) = line.split_once(':') {
                services.insert(
                    name.trim().into(),
                    Service {
                        command: command.trim().into(),
                        socket: path.with_file_name(".overmind.sock"),
                    },
                );
            }
        }
    }
    Ok(services)
}

#[cfg(unix)]
async fn request(path: &Path, command: &str, stream: bool) -> Result<String> {
    let mut socket = tokio::net::UnixStream::connect(path).await?;
    socket.write_all(format!("{command}\n").as_bytes()).await?;
    if matches!(command, "stop" | "restart") {
        return Ok(String::new());
    }
    if stream {
        let mut stdout = tokio::io::stdout();
        tokio::io::copy(&mut socket, &mut stdout).await?;
        return Ok(String::new());
    }
    let mut data = String::new();
    tokio::time::timeout(Duration::from_secs(5), socket.read_to_string(&mut data)).await??;
    Ok(data.replace('\0', ""))
}

#[cfg(not(unix))]
async fn request(_path: &Path, _command: &str, _stream: bool) -> Result<String> {
    anyhow::bail!("Service sockets require Unix")
}

pub async fn control(operation: &str, name: Option<&str>) -> Result<()> {
    let services = discover()?;
    if let Some(name) = name {
        anyhow::ensure!(
            services.contains_key(name),
            "Service {name:?} not found in Procfile"
        );
    }
    if services.is_empty() {
        println!("No services running");
        return Ok(());
    }
    if operation == "ps" {
        println!("PROCESS\tPID\tSTATUS\tCOMMAND");
    }
    for (name, service) in services
        .iter()
        .filter(|(n, _)| name.is_none_or(|v| n.as_str() == v))
    {
        match operation {
            "ps" | "status" => {
                let response = request(&service.socket, "status", false)
                    .await
                    .unwrap_or_default();
                let line = response
                    .lines()
                    .find(|l| l.starts_with(&format!("{name} ")))
                    .unwrap_or("");
                let pid = line.split_whitespace().nth(1).unwrap_or("");
                let status = if line.contains("running") {
                    "Up"
                } else {
                    "Stopped"
                };
                println!("{name}\t{pid}\t{status}\t{}", service.command);
                if operation == "status" {
                    println!("Socket: {}", service.socket.display());
                }
            }
            "down" if matches!(name.as_str(), "mysql" | "mariadb") => {
                crate::process::execute(
                    &std::env::current_exe()?.to_string_lossy(),
                    ["run", "--wasm", name, "stop"],
                    Path::new("."),
                )
                .await?;
            }
            operation => {
                let command = match operation {
                    "up" | "start" | "restart" => "restart",
                    "stop" | "down" => "stop",
                    "echo" => "echo",
                    _ => anyhow::bail!("Unknown service operation"),
                };
                request(&service.socket, command, command == "echo")
                    .await
                    .with_context(|| format!("{command} {name}"))?;
                if command != "echo" {
                    println!("{name}: {command}");
                }
            }
        }
    }
    Ok(())
}
