//! Durable pipeline execution. Output and state changes are persisted before publication.

use crate::{db::Db, models::*, pipeline};
use anyhow::{Context, Result};
use std::{path::Path, process::Stdio, time::Instant};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    sync::broadcast,
};

pub type Events = broadcast::Sender<String>;

pub fn publish(events: Option<&Events>, channel: &str, data: impl serde::Serialize) {
    if let Some(events) = events {
        let _ = events.send(serde_json::json!({"channel":channel,"data":data}).to_string());
    }
}

pub async fn prepare(db: &Db, project: &Project) -> Result<Run> {
    let mut actions = db.actions(&project.id).await?;
    if actions.is_empty() {
        actions = crate::detection::actions(Path::new(&project.path))?;
        db.save_actions(&project.id, &actions).await?;
    }
    anyhow::ensure!(
        !actions.is_empty(),
        "No actions configured for project {}",
        project.name
    );
    let run = Run {
        id: id(),
        name: project.name.clone(),
        project: project.name.clone(),
        project_id: project.id.clone(),
        title: format!("Run {}", project.name),
        date: now(),
        status: Some("PENDING".into()),
        jobs: actions
            .iter()
            .map(|a| Job {
                id: id(),
                name: a.name.clone(),
                status: if a.enabled { "PENDING" } else { "SKIPPED" }.into(),
                created_at: now(),
                ..Job::default()
            })
            .collect(),
        ..Run::default()
    };
    db.save_run(&run).await?;
    Ok(run)
}

pub async fn execute(db: Db, project: Project, events: Option<Events>) -> Result<Run> {
    let run = prepare(&db, &project).await?;
    execute_prepared(db, project, run, events).await
}

pub async fn execute_job(
    db: Db,
    project: Project,
    name: &str,
    events: Option<Events>,
) -> Result<Job> {
    let mut run = prepare(&db, &project).await?;
    anyhow::ensure!(
        run.jobs.iter().any(|job| job.name == name),
        "Job {name:?} not found"
    );
    for job in &mut run.jobs {
        if job.name != name {
            job.status = "SKIPPED".into();
        }
    }
    db.save_run(&run).await?;
    let run = execute_prepared(db, project, run, events).await?;
    run.jobs
        .into_iter()
        .find(|job| job.name == name)
        .context("Job missing from completed run")
}

pub async fn execute_prepared(
    db: Db,
    project: Project,
    mut run: Run,
    events: Option<Events>,
) -> Result<Run> {
    let started = Instant::now();
    let actions = db.actions(&project.id).await?;
    run.status = Some("RUNNING".into());
    db.save_run(&run).await?;
    publish(events.as_ref(), "run", &run);
    let outcome = execute_actions(&db, &project, &mut run, &actions, events.as_ref()).await;
    if let Err(error) = &outcome {
        run.message = Some(format!("{error:#}"));
    }
    run.duration = started.elapsed().as_millis().min(i32::MAX as u128) as i32;
    let cancelled = db
        .run(&run.id)
        .await?
        .is_some_and(|r| r.status.as_deref() == Some("CANCELLED"));
    run.status = Some(
        if cancelled {
            "CANCELLED"
        } else if outcome.is_ok() {
            "SUCCESS"
        } else {
            "FAILURE"
        }
        .into(),
    );
    for job in &mut run.jobs {
        if cancelled && matches!(job.status.as_str(), "RUNNING" | "PENDING") {
            job.status = "CANCELLED".into();
        } else if job.status == "RUNNING" {
            job.status = "FAILURE".into();
        } else if job.status == "PENDING" {
            job.status = "SKIPPED".into();
        }
    }
    db.save_run(&run).await?;
    update_stats(&db, &project).await?;
    publish(events.as_ref(), "run", &run);
    publish(
        events.as_ref(),
        "update-stats",
        serde_json::json!({"projectId":project.id}),
    );
    outcome?;
    Ok(run)
}

async fn execute_actions(
    db: &Db,
    project: &Project,
    run: &mut Run,
    actions: &[Action],
    events: Option<&Events>,
) -> Result<()> {
    for (index, action) in actions.iter().enumerate().filter(|(_, a)| a.enabled) {
        if run.jobs[index].status == "SKIPPED" {
            continue;
        }
        if db
            .run(&run.id)
            .await?
            .is_some_and(|r| r.status.as_deref() == Some("CANCELLED"))
        {
            anyhow::bail!("Run cancelled");
        }
        let started = Instant::now();
        run.jobs[index].status = "RUNNING".into();
        run.jobs[index].started_at = Some(now());
        db.save_run(run).await?;
        publish(events, "job", &run.jobs[index]);
        for command in pipeline::action_commands(action)? {
            let mut action = action.clone();
            action.commands = command;
            let mut command = pipeline::action_command(&action, Path::new(&project.path)).await?;
            command
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            let mut child = command.spawn().context("Starting pipeline action")?;
            let stdout = child.stdout.take().context("Missing child stdout")?;
            let stderr = child.stderr.take().context("Missing child stderr")?;
            let mut out = BufReader::new(stdout).lines();
            let mut err = BufReader::new(stderr).lines();
            let (mut out_done, mut err_done) = (false, false);
            let mut cancellation = tokio::time::interval(std::time::Duration::from_millis(250));
            while !out_done || !err_done {
                let message = tokio::select! {
                    line=out.next_line(),if !out_done=>{let line=line?;out_done=line.is_none();line},
                    line=err.next_line(),if !err_done=>{let line=line?;err_done=line.is_none();line},
                    _=cancellation.tick()=>{
                        if db.run(&run.id).await?.is_some_and(|r|r.status.as_deref()==Some("CANCELLED")) {
                            child.kill().await?; anyhow::bail!("Run cancelled");
                        } None
                    },
                };
                if let Some(message) = message {
                    println!("{message}");
                    let log = Log {
                        id: id(),
                        job_id: run.jobs[index].id.clone(),
                        message: message.clone(),
                        created_at: now(),
                    };
                    run.jobs[index]
                        .logs
                        .get_or_insert_default()
                        .push(log.clone());
                    db.save_run(run).await?;
                    publish(
                        events,
                        "logs",
                        serde_json::json!({"id":log.id,"createdAt":log.created_at,"text":message,"jobId":log.job_id,"projectId":project.id,"runId":run.id}),
                    );
                }
            }
            let status = child.wait().await?;
            anyhow::ensure!(
                status.success(),
                "Action {:?} exited with {status}",
                action.name
            );
        }
        run.jobs[index].status = "SUCCESS".into();
        run.jobs[index].duration = Some(started.elapsed().as_millis().min(i32::MAX as u128) as i32);
        db.save_run(run).await?;
        publish(events, "job", &run.jobs[index]);
    }
    Ok(())
}

async fn update_stats(db: &Db, project: &Project) -> Result<()> {
    let runs = db.runs(&project.id).await?;
    let recent: Vec<_> = runs.iter().rev().take(18).cloned().collect();
    let mut p = project.clone();
    if !recent.is_empty() {
        p.speed = Some(recent.iter().map(|r| r.duration as f64).sum::<f64>() / recent.len() as f64);
        p.reliability = Some(
            100.0
                * recent
                    .iter()
                    .filter(|r| r.status.as_deref() == Some("SUCCESS"))
                    .count() as f64
                / recent.len() as f64,
        );
    }
    let since = chrono::Utc::now() - chrono::Duration::days(7);
    p.builds_per_week = Some(
        runs.iter()
            .filter(|r| chrono::DateTime::parse_from_rfc3339(&r.date).is_ok_and(|d| d > since))
            .count() as i32,
    );
    p.recent_runs = Some(recent);
    db.save_project_stats(&p).await
}
