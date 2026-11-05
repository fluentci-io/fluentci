use super::progress::Progress;
use anyhow::{anyhow, Error};
use std::{
    path::Path,
    time::{Duration, Instant},
};

/// Read-only observation. This command never owns or signals the pipeline.
pub async fn watch(
    run_dir: &str,
    mode: &str,
    follow: bool,
    timeout_ms: Option<u64>,
    server: Option<&str>,
) -> Result<(), Error> {
    if timeout_ms == Some(0) {
        return Err(anyhow!("timeout-ms must be positive"));
    }
    if let Some(server) = server {
        return super::watch_remote::watch(server, run_dir, mode, follow, timeout_ms).await;
    }
    let run = std::fs::canonicalize(Path::new(run_dir))?;
    if !run.is_dir() {
        return Err(anyhow!("run directory must be a directory"));
    }
    let path = run.join("events.jsonl");
    let limit = if follow {
        None
    } else {
        Some(
            std::fs::symlink_metadata(&path)
                .map_err(|error| {
                    anyhow!("journal unavailable: {error}; use --follow to wait for startup")
                })?
                .len(),
        )
    };
    #[cfg(unix)]
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    #[cfg(unix)]
    let shutdown = async move {
        interrupt.recv().await;
        Ok::<(), std::io::Error>(())
    };
    #[cfg(not(unix))]
    let shutdown = tokio::signal::ctrl_c();
    tokio::pin!(shutdown);
    let mut display = Progress::replay(mode).map_err(|e| anyhow!(e))?;
    if let Some(limit) = limit {
        display.limit(limit);
    }
    let started = Instant::now();
    loop {
        if timeout_ms.is_some_and(|ms| started.elapsed() >= Duration::from_millis(ms)) {
            return Err(anyhow!(
                "watch timed out; pipeline execution was not cancelled"
            ));
        }
        let delay = if display.caught_up() { 50 } else { 0 };
        tokio::select! {
            biased;
            signal = &mut shutdown => { signal?; display.finish_display().map_err(|e| anyhow!(e))?; return Ok(()); }
            _ = tokio::time::sleep(Duration::from_millis(delay)) => {}
        }
        display.poll(&path, false).map_err(|e| anyhow!(e))?;
        if display.caught_up() && (!follow || display.completed().is_some()) {
            display.finish_display().map_err(|e| anyhow!(e))?;
            return if display.completed() == Some(false) {
                match std::fs::read(run.join("result.json"))
                    .ok()
                    .and_then(|bytes| {
                        serde_json::from_slice::<fluentci_executor::RunResult>(&bytes).ok()
                    })
                    .and_then(|report| report.failure())
                {
                    Some(failure) => Err(failure.into()),
                    None => Err(anyhow!("pipeline failed or was cancelled; see result.json")),
                }
            } else {
                Ok(())
            };
        }
    }
}
