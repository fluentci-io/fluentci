use anyhow::{anyhow, Error};
use fluentci_executor::{Cancellation, Plan};
use std::path::PathBuf;

/// Execute a language-neutral, explicit host plan.
pub async fn execute(path: &str, run_dir: &str, progress: &str) -> Result<(), Error> {
    fluentci_core::init_tracer().map_err(|e| anyhow!(e.to_string()))?;
    let result = execute_inner(path, run_dir, progress).await;
    tokio::task::spawn_blocking(fluentci_core::shutdown_tracer).await?;
    result
}

async fn execute_inner(path: &str, run_dir: &str, progress: &str) -> Result<(), Error> {
    let mut plan: Plan = serde_json::from_slice(&std::fs::read(path)?)?;
    let plan_path = std::fs::canonicalize(path)?;
    let base = plan_path
        .parent()
        .ok_or_else(|| anyhow!("plan has no parent directory"))?;
    plan.resolve_paths(base).map_err(|error| anyhow!(error))?;
    let cancel = Cancellation::default();
    let worker_cancel = cancel.clone();
    let run_dir = PathBuf::from(run_dir);
    let mut display = super::progress::Progress::new(&plan, progress).map_err(|e| anyhow!(e))?;
    let event_path = run_dir.join("events.jsonl");
    let result_path = run_dir.join("result.json");
    // Register before starting commands so early SDK cancellation cannot take
    // the default SIGINT action after a child has already been launched.
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
    let mut run = tokio::task::spawn_blocking(move || plan.execute(&run_dir, &worker_cancel));
    let mut ticker = tokio::time::interval(std::time::Duration::from_millis(50));
    let result = loop {
        tokio::select! {
            result = &mut run => break result,
            signal = &mut shutdown => {
                cancel.cancel();
                signal?;
                break run.await;
            }
            _ = ticker.tick() => {
                if let Err(error) = display.poll(&event_path, false) {
                    cancel.cancel();
                    let _ = run.await;
                    return Err(anyhow!(error));
                }
            }
        }
    }?
    .map_err(|e| anyhow!(e))?;
    display.poll(&event_path, true).map_err(|e| anyhow!(e))?;
    if let Some(failure) = result.failure() {
        return Err(Error::new(failure).context(format!("see {}", result_path.display())));
    }
    Ok(())
}
