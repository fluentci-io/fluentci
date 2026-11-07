use anyhow::{anyhow, Error};
pub use fluentci_executor::affected::GitOptions;
use fluentci_executor::{
    affected::{Changes, Selection},
    Cancellation, Plan,
};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default)]
pub struct Options {
    pub git: Option<GitOptions>,
    pub global_inputs: Vec<PathBuf>,
    pub dry_run: bool,
}

#[derive(Serialize)]
struct Summary<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    changes: Option<&'a Changes>,
    #[serde(flatten)]
    selection: Selection,
    total: usize,
    selected: usize,
}

/// Analyze or execute without spawning another CLI. The JSON summary is produced
/// only for an explicit dry run; native execution compiles the selected DAG once.
pub async fn execute_with_options(
    path: &str,
    run_dir: Option<&str>,
    progress: &str,
    options: Options,
) -> Result<(), Error> {
    let plan = if options.git.is_some() || options.dry_run {
        let (plan, changes, selection) = prepare(Path::new(path), &options)?;
        if options.dry_run {
            let total = plan.tasks.len();
            let selected = selection.tasks.iter().filter(|task| task.selected).count();
            println!(
                "{}",
                serde_json::to_string_pretty(&Summary {
                    changes: changes.as_ref(),
                    selection,
                    total,
                    selected
                })?
            );
            return Ok(());
        }
        selection.apply(&plan).map_err(|error| anyhow!(error))?
    } else {
        // Ordinary execution does not serialize or fingerprint the native plan.
        read_plan(Path::new(path))?.0
    };
    let run_dir =
        run_dir.ok_or_else(|| anyhow!("--run-dir is required unless --dry-run is provided"))?;
    fluentci_core::init_tracer().map_err(|error| anyhow!(error.to_string()))?;
    let result = execute_plan(plan, run_dir, progress).await;
    tokio::task::spawn_blocking(fluentci_core::shutdown_tracer).await?;
    result
}

fn prepare(path: &Path, options: &Options) -> Result<(Plan, Option<Changes>, Selection), Error> {
    let (plan, plan_path) = read_plan(path)?;
    let base = plan_path
        .parent()
        .ok_or_else(|| anyhow!("plan has no parent directory"))?;
    let changes = options
        .git
        .as_ref()
        .map(|git| {
            Changes::discover(
                plan.workspace
                    .as_ref()
                    .map_or(base, |workspace| workspace.source.as_path()),
                git,
            )
        })
        .transpose()
        .map_err(|error| anyhow!(error))?;
    let selection = if let Some(changes) = &changes {
        let mut global = options.global_inputs.clone();
        // Plan edits can alter commands, environment, edges or toolchains.
        if let Ok(relative) = plan_path.strip_prefix(&changes.root) {
            global.push(relative.to_owned());
        }
        Selection::affected(&plan, &changes.root, &changes.files, &global)
            .map_err(|error| anyhow!(error))?
    } else {
        Selection::all(&plan).map_err(|error| anyhow!(error))?
    };
    Ok((plan, changes, selection))
}

fn read_plan(path: &Path) -> Result<(Plan, PathBuf), Error> {
    let plan_path = std::fs::canonicalize(path)?;
    let mut plan: Plan = serde_json::from_slice(&std::fs::read(&plan_path)?)?;
    let base = plan_path
        .parent()
        .ok_or_else(|| anyhow!("plan has no parent directory"))?;
    plan.resolve_paths(base).map_err(|error| anyhow!(error))?;
    Ok((plan, plan_path))
}

/// Execute a language-neutral, explicit host plan.
pub async fn execute(path: &str, run_dir: &str, progress: &str) -> Result<(), Error> {
    execute_with_options(path, Some(run_dir), progress, Options::default()).await
}

async fn execute_plan(plan: Plan, run_dir: &str, progress: &str) -> Result<(), Error> {
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
    let mut run =
        tokio::task::spawn_blocking(move || plan.compile()?.execute(&run_dir, &worker_cancel));
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
