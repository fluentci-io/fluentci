//! Go's GOCACHEPROG JSON protocol, bridged to the server over HTTP.
use self::{
    protocol::{Request, next_request, read_body},
    remote::execute,
};
use anyhow::{Context, Result, ensure};
use clap::Args;
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tempfile::TempDir;
use tokio::{
    io::{AsyncBufRead, AsyncWrite, AsyncWriteExt, BufReader},
    sync::Mutex,
    task::JoinSet,
};

mod protocol;
mod remote;

#[derive(Clone, Debug, Args)]
pub struct GoConfig {
    /// Base server URL (without /gocache).
    #[arg(
        long,
        env = "FLUENTCI_CACHE_URL",
        default_value = "http://127.0.0.1:8080"
    )]
    pub url: String,
    #[arg(long, env = "FLUENTCI_CACHE_TOKEN", hide_env_values = true)]
    pub token: Option<String>,
    /// Parent for temporary session files, retained until Go sends close.
    #[arg(long, env = "FLUENTCI_CACHE_GO_DIRECTORY")]
    pub directory: Option<PathBuf>,
    #[arg(long, default_value_t = 10 * 1024 * 1024 * 1024_u64)]
    pub max_object: u64,
}

struct ContextState {
    config: GoConfig,
    client: reqwest::Client,
    files: TempDir,
}

pub async fn run(config: GoConfig) -> Result<()> {
    serve(
        config,
        BufReader::new(tokio::io::stdin()),
        tokio::io::stdout(),
    )
    .await
}

/// Runs the helper with supplied streams, also useful for protocol integration tests.
pub async fn serve<R, W>(config: GoConfig, mut input: R, output: W) -> Result<()>
where
    R: AsyncBufRead + Unpin,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let url = reqwest::Url::parse(&config.url)?;
    ensure!(
        matches!(url.scheme(), "http" | "https")
            && url.query().is_none()
            && url.fragment().is_none(),
        "URL must be an HTTP(S) base URL without query or fragment"
    );
    let files = match &config.directory {
        Some(directory) => {
            tokio::fs::create_dir_all(directory).await?;
            tempfile::tempdir_in(directory)?
        }
        None => tempfile::tempdir()?,
    };
    let context = Arc::new(ContextState {
        client: reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()?,
        config,
        files,
    });
    let output = Arc::new(Mutex::new(output));
    reply(
        &output,
        json!({"ID": 0, "KnownCommands": ["get", "put", "close"]}),
    )
    .await?;
    let mut tasks = JoinSet::new();
    while let Some(line) = next_request(&mut input).await? {
        let request: Request = serde_json::from_str(&line).context("invalid Go cache request")?;
        if request.command == "close" {
            while let Some(result) = tasks.join_next().await {
                result??;
            }
            reply(&output, json!({"ID": request.id})).await?;
            return Ok(());
        }
        // Bound outstanding HTTP requests and temporary file creation.
        if tasks.len() >= 32 {
            tasks.join_next().await.unwrap()??;
        }
        let file = if request.command == "put" {
            ensure!(
                request.body_size <= context.config.max_object,
                "Go cache object exceeds helper limit"
            );
            Some(read_body(&mut input, &request, &context.files).await?)
        } else {
            None
        };
        let context = context.clone();
        let output = output.clone();
        tasks.spawn(async move {
            let value = match execute(&context, &request, file).await {
                Ok(value) => value,
                Err(error) => json!({"ID": request.id, "Err": error.to_string()}),
            };
            reply(&output, value).await
        });
    }
    while let Some(result) = tasks.join_next().await {
        result??;
    }
    Ok(())
}

async fn reply<W: AsyncWrite + Unpin>(output: &Mutex<W>, response: Value) -> Result<()> {
    let mut data = serde_json::to_vec(&response)?;
    data.push(b'\n');
    let mut output = output.lock().await;
    output.write_all(&data).await?;
    output.flush().await?;
    Ok(())
}
