use super::{
    HEARTBEAT, JoinArgs, Node, TTL, client,
    jobs::{self, Complete, Job, Outcome, Ownership, Phase},
    response, shutdown,
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, path::Path, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::watch,
    task::JoinSet,
};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
struct Journal {
    job: Uuid,
    claim: Uuid,
}

impl Journal {
    fn name(&self) -> String {
        format!("fluentci-{}-{}", self.job, self.claim)
    }
}

async fn tail(mut reader: impl AsyncRead + Unpin) -> Result<String> {
    let mut tail = VecDeque::with_capacity(65536);
    let mut buffer = [0; 8192];
    loop {
        let count = reader.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        for byte in &buffer[..count] {
            if tail.len() == 16384 {
                tail.pop_front();
            }
            tail.push_back(*byte);
        }
    }
    // Lossy conversion stays below the API's 64-KiB limit even for invalid UTF-8.
    Ok(String::from_utf8_lossy(tail.make_contiguous()).into_owned())
}

async fn invoke(binary: &str, args: &[String]) -> Result<Outcome> {
    let mut child = Command::new(binary)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_remove("FLUENTCI_CLUSTER_TOKEN")
        .env_remove("FLUENTCI_CLUSTER_STATE_TOKEN")
        .kill_on_drop(true)
        .spawn()
        .context("Cannot start bsdkrun")?;
    let stdout = child.stdout.take().context("Missing stdout")?;
    let stderr = child.stderr.take().context("Missing stderr")?;
    let (status, stdout, stderr) = tokio::try_join!(
        async { Ok::<_, anyhow::Error>(child.wait().await?) },
        tail(stdout),
        tail(stderr)
    )?;
    Ok(Outcome {
        success: status.success(),
        exit_code: status.code(),
        stdout,
        stderr,
        error: None,
    })
}

async fn cleanup(binary: &str, journal: &Journal, path: &Path) -> Result<()> {
    let result = tokio::time::timeout(
        Duration::from_secs(60),
        invoke(binary, &["rm".into(), "-f".into(), journal.name()]),
    )
    .await
    .context("VM cleanup timed out; journal retained")??;
    if !result.success {
        // A failed boot may not have created a VM. Never mistake a failed
        // removal for successful cleanup while the machine still exists.
        let listing = tokio::time::timeout(
            Duration::from_secs(10),
            invoke(binary, &["ps".into(), "-a".into(), "--json".into()]),
        )
        .await??;
        ensure!(
            listing.success,
            "Cannot verify VM cleanup: {}",
            listing.stderr
        );
        let machines: Vec<serde_json::Value> = serde_json::from_str(&listing.stdout)
            .context("Invalid bsdkrun ps JSON; journal retained")?;
        ensure!(
            !machines
                .iter()
                .any(|machine| machine["name"].as_str() == Some(&journal.name())),
            "VM cleanup failed: {}",
            result.stderr
        );
    }
    tokio::fs::remove_file(path).await?;
    Ok(())
}

async fn recover(args: &JoinArgs) -> Result<()> {
    let mut entries = tokio::fs::read_dir(&args.work_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.starts_with("vm-")
            || !name.ends_with(".json")
            || !entry.file_type().await?.is_file()
        {
            continue;
        }
        let journal: Journal = serde_json::from_slice(&tokio::fs::read(entry.path()).await?)?;
        ensure!(
            name == format!("vm-{}.json", journal.claim),
            "Invalid runner journal name"
        );
        tracing::warn!(vm = %journal.name(), "Removing VM left by an interrupted runner");
        cleanup(&args.bsdkrun, &journal, &entry.path()).await?;
    }
    Ok(())
}

fn boot_args(job: &Job, journal: &Journal) -> Vec<String> {
    vec![
        "linux".into(),
        job.spec.image.clone(),
        "-d".into(),
        "--name".into(),
        journal.name(),
        "--cpus".into(),
        job.spec.cpus.to_string(),
        "--mem".into(),
        job.spec.memory.to_string(),
        "--entrypoint".into(),
        "/bin/sh".into(),
        "--".into(),
        "-c".into(),
        "while :; do sleep 3600; done".into(),
    ]
}

fn exec_args(job: &Job, journal: &Journal) -> Vec<String> {
    // Only this fixed script is interpreted by a shell. Repository, revision,
    // and guest argv travel as positional arguments and never become shell code.
    let script = "set -eu; git clone -- \"$1\" /workspace; cd /workspace; git checkout --detach \"$2\"; shift 2; exec \"$@\"";
    let mut args = vec![
        "exec".into(),
        journal.name(),
        "sh".into(),
        "-c".into(),
        script.into(),
        "fluentci-job".into(),
        job.spec.repo.clone(),
        job.spec.revision.clone(),
    ];
    args.extend(job.spec.command.clone());
    args
}

async fn execute_vm(args: &JoinArgs, job: &Job, journal: &Journal) -> Result<Outcome> {
    let boot = invoke(&args.bsdkrun, &boot_args(job, journal)).await?;
    ensure!(boot.success, "VM boot failed: {}", boot.stderr);
    // Probe readiness using a harmless command. Never retry the actual job,
    // which could otherwise execute twice after an ambiguous agent failure.
    loop {
        let ready = invoke(
            &args.bsdkrun,
            &["exec".into(), journal.name(), "true".into()],
        )
        .await?;
        if ready.success {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    invoke(&args.bsdkrun, &exec_args(job, journal)).await
}

pub(super) async fn run_job(
    args: Arc<JoinArgs>,
    job: Job,
    mut stop: watch::Receiver<bool>,
) -> Result<()> {
    let Phase::Running { runner, claim, .. } = job.phase else {
        anyhow::bail!("API returned an unclaimed job")
    };
    let ownership = Ownership { runner, claim };
    let journal = Journal { job: job.id, claim };
    let path = args.work_dir.join(format!("vm-{claim}.json"));
    tokio::fs::write(&path, serde_json::to_vec(&journal)?).await?;
    let client = client(5)?;
    let renew = async {
        loop {
            tokio::time::sleep(Duration::from_secs(HEARTBEAT)).await;
            response(
                args.connection
                    .request(
                        &client,
                        reqwest::Method::POST,
                        &format!("/v1/jobs/{}/renew", job.id),
                    )?
                    .json(&ownership)
                    .send()
                    .await?,
            )
            .await?;
        }
        #[allow(unreachable_code)]
        Ok::<(), anyhow::Error>(())
    };
    let result = tokio::select! {
        result = tokio::time::timeout(Duration::from_secs(u64::from(job.spec.timeout)), execute_vm(&args, &job, &journal)) => result.context("VM job timed out").and_then(|r| r),
        result = renew => Err(result.err().unwrap_or_else(|| anyhow::anyhow!("Claim renewal stopped"))),
        _ = stop.changed() => Err(anyhow::anyhow!("Runner stopping")),
    };
    // Always tear down the VM before releasing the slot or publishing success.
    // On failure, leave the journal and stop the runner instead of leaking VMs.
    cleanup(&args.bsdkrun, &journal, &path).await?;
    let outcome = match result {
        Ok(outcome) => outcome,
        Err(error) => Outcome {
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(format!("{error:#}").chars().take(2000).collect()),
        },
    };
    if let Err(error) = async {
        response(
            args.connection
                .request(
                    &client,
                    reqwest::Method::POST,
                    &format!("/v1/jobs/{}/complete", job.id),
                )?
                .json(&Complete {
                    ownership,
                    result: outcome,
                })
                .send()
                .await?,
        )
        .await?;
        Ok::<(), anyhow::Error>(())
    }
    .await
    {
        tracing::warn!(job = %job.id, %error, "Result not accepted; inspect the durable run record (cancelled or lost claims cannot complete)");
    }
    Ok(())
}

pub(super) async fn join(args: &JoinArgs) -> Result<()> {
    super::validate_token(&args.connection.auth.token)?;
    super::origin(&args.connection.api)?;
    ensure!(
        !args.name.is_empty() && args.name.len() <= 128,
        "Runner name must contain 1–128 bytes"
    );
    tokio::fs::create_dir_all(&args.work_dir).await?;
    let _guard = crate::file_guard::FileGuard::acquire(args.work_dir.join("runner.lock")).await?;
    recover(args).await?;
    let probe = tokio::time::timeout(
        Duration::from_secs(30),
        invoke(&args.bsdkrun, &["probe".into()]),
    )
    .await
    .context("bsdkrun probe timed out")??;
    ensure!(probe.success, "bsdkrun cannot create VMs: {}", probe.stderr);
    let node = Node {
        id: Uuid::new_v4(),
        name: args.name.clone(),
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        cpus: std::thread::available_parallelism().map_or(1, usize::from),
        max_memory: args.max_memory,
        slots: args.slots,
        labels: args.labels.clone(),
        version: env!("CARGO_PKG_VERSION").into(),
        expires_at: 0,
    };
    let client = client(5)?;
    let heartbeat = || {
        args.connection
            .request(&client, reqwest::Method::POST, "/v1/nodes")
            .map(|request| request.json(&node))
    };
    response(heartbeat()?.send().await?).await?;
    println!(
        "Runner {} joined as {} with {} VM slot(s)",
        node.name, node.id, node.slots
    );
    println!(
        "Waiting for jobs. Each job boots a fresh bsdkrun VM. Ctrl-C stops and cleans up active VMs."
    );
    let (stop, stopped) = watch::channel(false);
    let mut tasks = JoinSet::new();
    let mut ticks = tokio::time::interval(Duration::from_secs(2));
    ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last_heartbeat = tokio::time::Instant::now();
    let shared_args = Arc::new(args.clone());
    let mut failure = None;
    loop {
        tokio::select! {
            _ = shutdown() => break,
            result = tasks.join_next(), if !tasks.is_empty() => {
                if let Some(result) = result && let Err(error) = result.context("Runner task panicked").and_then(|r| r) { failure = Some(error); break; }
            }
            _ = ticks.tick() => {
                if last_heartbeat.elapsed() >= Duration::from_secs(HEARTBEAT) {
                    match async { response(heartbeat()?.send().await?).await }.await {
                        Ok(_) => last_heartbeat = tokio::time::Instant::now(),
                        Err(error) => {
                            tracing::warn!(%error, "Runner heartbeat failed; pausing claims");
                            if last_heartbeat.elapsed() >= Duration::from_secs(TTL) { failure = Some(error); break; }
                            continue;
                        }
                    }
                }
                if tasks.len() < usize::from(args.slots) {
                    match jobs::next(&args.connection, &client, node.id).await {
                        Ok(Some(job)) => { println!("Claimed run {}", job.id); tasks.spawn(run_job(shared_args.clone(), job, stopped.clone())); }
                        Ok(None) => {},
                        Err(error) => tracing::warn!(%error, "Cannot claim work; retrying"),
                    }
                }
            }
        }
    }
    let _ = stop.send(true);
    while let Some(result) = tasks.join_next().await {
        if let Err(error) = result.context("Runner task panicked").and_then(|r| r) {
            failure = Some(error);
        }
    }
    if let Err(error) = async {
        response(
            args.connection
                .request(
                    &client,
                    reqwest::Method::DELETE,
                    &format!("/v1/nodes/{}", node.id),
                )?
                .send()
                .await?,
        )
        .await?;
        Ok::<(), anyhow::Error>(())
    }
    .await
    {
        tracing::warn!(%error, "Leave failed; membership will expire");
    }
    if let Some(error) = failure {
        return Err(error);
    }
    Ok(())
}
