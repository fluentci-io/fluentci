//! Compatibility with FluentCI's hosted runner protocol.

use crate::{archive, db::Db, registry};
use anyhow::{Context, Result, bail};
use futures_util::{SinkExt, StreamExt};
use std::path::Path;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

pub async fn list_agents(db: &Db) -> Result<()> {
    let token = legacy_token(db).await?;
    let id = legacy_user_id(&token).await?;
    let data: serde_json::Value = registry::client()
        .get(format!("{}/agents", registry::EVENTS))
        .query(&[("id", id)])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    println!("{}", serde_json::to_string_pretty(&data)?);
    Ok(())
}

pub async fn agent(db: &Db) -> Result<()> {
    let token = legacy_token(db).await?;
    let id = if let Some(id) = db.setting("agent_id").await? {
        id
    } else {
        let id = crate::models::id();
        db.set_setting("agent_id", &id).await?;
        id
    };
    let hostname = Command::new("hostname")
        .output()
        .await
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        .unwrap_or_default();
    let dagger = Command::new("dagger")
        .arg("version")
        .output()
        .await
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        .unwrap_or_default();
    let uuid = registry::client()
        .get(format!("{}/auth", registry::EVENTS))
        .bearer_auth(&token)
        .query(&[
            ("agent_id", id.clone()),
            ("hostname", hostname),
            (
                "cpus",
                std::thread::available_parallelism()
                    .map_or(1, usize::from)
                    .to_string(),
            ),
            ("arch", std::env::consts::ARCH.into()),
            ("platform", std::env::consts::OS.into()),
            ("release", String::new()),
            ("totalmem", "0".into()),
            ("version", env!("CARGO_PKG_VERSION").into()),
            ("pid", std::process::id().to_string()),
            ("daggerversion", dagger),
        ])
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let mut url = reqwest::Url::parse(registry::WEBSOCKET)?;
    url.query_pairs_mut()
        .append_pair("agent_id", &id)
        .append_pair("uuid", &uuid);
    let (mut ws, _) = tokio_tungstenite::connect_async(url.as_str()).await?;
    println!("Agent {id} connected; waiting for jobs");
    loop {
        tokio::select! {
            _=tokio::signal::ctrl_c()=>{ws.close(None).await?;return Ok(());},
            message=ws.next()=>{
                let Some(message)=message else{bail!("Agent disconnected")};let message=message?;
                if let tokio_tungstenite::tungstenite::Message::Ping(data)=message{ws.send(tokio_tungstenite::tungstenite::Message::Pong(data)).await?;continue;}
                if !message.is_text(){continue;}
                let event:serde_json::Value=match serde_json::from_str(message.to_text()?){Ok(v)=>v,Err(_)=>continue};
                let payload=if let Some(event)=event["event"].as_str(){serde_json::from_str(event)?}else{event};
                if payload["action"]!="build"{continue;}
                if let Err(error)=build(&payload,&token).await{tracing::error!(%error,"Remote job failed");}
            }
        }
    }
}

async fn build(payload: &serde_json::Value, token: &str) -> Result<()> {
    let temp = tempfile::tempdir()?;
    let query: serde_json::Value =
        serde_json::from_str(payload["query"].as_str().context("Missing job query")?)?;
    if let Some(repo) = payload["repoUrl"].as_str() {
        crate::process::execute(
            "git",
            ["clone", "--", repo, &temp.path().to_string_lossy()],
            Path::new("."),
        )
        .await?;
    } else {
        let src = payload["src"].as_str().context("Missing job source")?;
        let (project, hash) = src.split_once('/').context("Invalid source path")?;
        let bytes = registry::client()
            .get(registry::RUNNER)
            .query(&[
                ("project_id", project),
                ("sha256", hash.trim_end_matches(".zip")),
            ])
            .bearer_auth(token)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        archive::extract(&bytes, temp.path())?;
    }
    let work_dir = query["workDir"].as_str().unwrap_or(".");
    let cwd = temp.path().join(work_dir).canonicalize()?;
    anyhow::ensure!(
        cwd.starts_with(temp.path().canonicalize()?),
        "Job work directory escapes build context"
    );
    let run_id = payload["runId"].as_str().context("Missing run ID")?;
    let mut c = Command::new(crate::process::current_exe()?);
    c.arg("run");
    if query["wasm"].as_bool().unwrap_or(false) {
        c.arg("--wasm");
    }
    c.arg(query["pipeline"].as_str().unwrap_or("."));
    if let Some(jobs) = query["jobs"].as_array() {
        for job in jobs {
            if let Some(job) = job.as_str() {
                c.arg(job);
            }
        }
    }
    c.current_dir(cwd)
        .env_remove("FLUENTCI_PROJECT_ID")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = c.spawn()?;
    let mut out = BufReader::new(child.stdout.take().context("Missing stdout")?).lines();
    let mut err = BufReader::new(child.stderr.take().context("Missing stderr")?).lines();
    let (mut out_done, mut err_done) = (false, false);
    while !out_done || !err_done {
        let line = tokio::select! {line=out.next_line(),if !out_done=>{let line=line?;out_done=line.is_none();line},line=err.next_line(),if !err_done=>{let line=line?;err_done=line.is_none();line}};
        if let Some(line) = line {
            println!("{line}");
            send(run_id, token, line).await?;
        }
    }
    let status = child.wait().await?;
    send(
        run_id,
        token,
        format!("fluentci_exit={}", status.code().unwrap_or(1)),
    )
    .await?;
    Ok(())
}

async fn send(id: &str, token: &str, body: String) -> Result<()> {
    registry::client()
        .post(registry::EVENTS)
        .query(&[("client_id", id)])
        .bearer_auth(token)
        .body(body)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

// Legacy hosted-agent credentials are independent of AT Protocol publishing.
async fn legacy_token(_db: &Db) -> Result<String> {
    std::env::var("FLUENTCI_ACCESS_TOKEN")
        .context("Legacy hosted agents require FLUENTCI_ACCESS_TOKEN")
}

async fn legacy_user_id(token: &str) -> Result<String> {
    Ok(registry::client()
        .get("https://api.fluentci.io/validate")
        .query(&[("token", token)])
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?)
}
