use get_port::tcp::TcpPort;
use get_port::{Ops, Range};
use std::{
    net::SocketAddr,
    process::{Command, Stdio},
    thread,
};

use anyhow::Error;
use fluentci_server::start_with_cancellation;
use tokio::runtime;

pub async fn run(command: &str) -> Result<(), Error> {
    let tcp_port = TcpPort::in_range(
        "127.0.0.1",
        Range {
            min: 6088,
            max: 65535,
        },
    )
    .unwrap();

    let addr = SocketAddr::from(([127, 0, 0, 1], tcp_port));

    let host = addr.ip();
    let port = addr.port();
    let listen = format!("{}:{}", host, port);

    let cancellation = fluentci_executor::Cancellation::default();
    let server_cancel = cancellation.clone();
    let (started, errors) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let rt = runtime::Runtime::new().unwrap();
        if let Err(error) = rt.block_on(start_with_cancellation(&listen, server_cancel)) {
            let _ = started.send(error.to_string());
        }
    });
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        if let Ok(error) = errors.try_recv() {
            return Err(anyhow::anyhow!("session server failed: {error}"));
        }
        if std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(50)).is_ok()
        {
            break;
        }
        if std::time::Instant::now() >= deadline {
            return Err(anyhow::anyhow!("session server startup timeout"));
        }
        thread::sleep(std::time::Duration::from_millis(20));
    }

    let mut child = Command::new("sh")
        .arg("-c")
        .arg(command)
        .env("FLUENTCI_SESSION_PORT", port.to_string())
        .env("FLUENTCI_SESSION_HOST", host.to_string())
        .env("FLUENTCI_SESSION_TOKEN", "token")
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    let status = child.wait();
    cancellation.cancel();
    if !cancellation.wait_idle(std::time::Duration::from_secs(15)) {
        return Err(anyhow::anyhow!(
            "session execution cleanup did not finish before shutdown"
        ));
    }
    let status = status?;
    if !status.success() {
        let (exit_code, signal) = fluentci_executor::diagnostics::process_exit(&status);
        return Err(fluentci_executor::diagnostics::ExecutionFailure {
            exit_code,
            message: format!(
                "session command failed (exit code {exit_code}, signal {signal:?}): {status}"
            ),
        }
        .into());
    }
    Ok(())
}
