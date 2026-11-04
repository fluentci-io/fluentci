use super::progress::Progress;
use anyhow::{anyhow, Error};
use fluentci_executor::events::Event;
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    Client, Response, Url,
};
use std::time::{Duration, Instant};

const PAGE_BYTES: usize = 4 * 1024 * 1024;
struct Remote {
    client: Client,
    run: Url,
    id: String,
}
struct Page {
    bytes: Vec<u8>,
    length: Option<u64>,
}

impl Remote {
    fn new(origin: &str, id: &str) -> Result<Self, Error> {
        let base = Url::parse(origin).map_err(|_| anyhow!("invalid server origin"))?;
        if !matches!(base.scheme(), "http" | "https")
            || base.host_str().is_none()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.path() != "/"
            || base.query().is_some()
            || base.fragment().is_some()
        {
            return Err(anyhow!(
                "server must be an HTTP(S) origin without credentials, path, query, or fragment"
            ));
        }
        if id.len() != 36
            || !id.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
                }
            })
        {
            return Err(anyhow!("remote run ID must be a lowercase UUID"));
        }
        let token = std::env::var("FLUENTCI_RUN_TOKEN")
            .map_err(|_| anyhow!("set FLUENTCI_RUN_TOKEN for remote watch"))?;
        if token.is_empty() || token.contains(['\r', '\n']) {
            return Err(anyhow!("invalid FLUENTCI_RUN_TOKEN"));
        }
        let mut auth = HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| anyhow!("invalid FLUENTCI_RUN_TOKEN"))?;
        auth.set_sensitive(true);
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, auth);
        let client = Client::builder()
            .default_headers(headers)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| anyhow!("could not initialize remote watch transport"))?;
        let run = base
            .join(&format!("/v1/runs/{id}"))
            .map_err(|_| anyhow!("invalid server origin"))?;
        Ok(Self {
            client,
            run,
            id: id.into(),
        })
    }
    async fn get(&self, url: Url) -> Result<Response, Error> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| anyhow!("remote watch request failed"))?;
        if response.status().as_u16() != 200 {
            return Err(anyhow!("remote watch HTTP {}", response.status().as_u16()));
        }
        Ok(response)
    }
    async fn page(&self, cursor: u64) -> Result<Page, Error> {
        let mut url = self.run.clone();
        url.set_path(&format!("{}/events", self.run.path()));
        url.set_query(Some(&format!("cursor={cursor}")));
        let response = self.get(url).await?;
        let next = number(response.headers(), "X-Next-Cursor")?
            .ok_or_else(|| anyhow!("missing remote event cursor"))?;
        let length = number(response.headers(), "X-Journal-Length")?;
        let bytes = body(response, PAGE_BYTES).await?;
        if cursor.checked_add(bytes.len() as u64) != Some(next)
            || (!bytes.is_empty() && !bytes.ends_with(b"\n"))
            || length.is_some_and(|length| length < next)
        {
            return Err(anyhow!("invalid remote event cursor or boundary"));
        }
        Ok(Page { bytes, length })
    }
    async fn failure(&self) -> Option<Error> {
        let endpoint = Url::parse(&format!(
            "{}/result",
            self.run.as_str().trim_end_matches('/')
        ))
        .ok()?;
        let response = self.get(endpoint).await.ok()?;
        let bytes = body(response, 16 * 1024 * 1024).await.ok()?;
        let report: fluentci_executor::RunResult = serde_json::from_slice(&bytes).ok()?;
        report.failure().map(Error::new)
    }
    async fn state(&self) -> Result<String, Error> {
        let bytes = body(self.get(self.run.clone()).await?, 65536).await?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| anyhow!("invalid remote run state"))?;
        let status = value["status"]
            .as_str()
            .ok_or_else(|| anyhow!("invalid remote run state"))?;
        if value["id"].as_str() != Some(&self.id)
            || !matches!(
                status,
                "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted"
            )
        {
            return Err(anyhow!("invalid remote run state"));
        }
        Ok(status.into())
    }
    async fn observe(
        &self,
        display: &mut Progress,
        follow: bool,
        timeout: Option<u64>,
    ) -> Result<(), Error> {
        let started = Instant::now();
        let mut cursor = 0u64;
        let mut snapshot = None;
        let mut terminal_seen = false;
        loop {
            let remaining = timeout
                .map(|ms| Duration::from_millis(ms).saturating_sub(started.elapsed()))
                .unwrap_or(Duration::from_secs(30))
                .min(Duration::from_secs(30));
            if remaining.is_zero() {
                return Err(anyhow!(
                    "watch timed out; pipeline execution was not cancelled"
                ));
            }
            let (mut page, state) = tokio::time::timeout(remaining, async {
                Ok::<_, Error>((self.page(cursor).await?, self.state().await?))
            })
            .await
            .map_err(|_| {
                anyhow!("remote watch request timed out; pipeline execution was not cancelled")
            })??;
            if !follow && snapshot.is_none() {
                snapshot = Some(page.length.ok_or_else(|| {
                    anyhow!("server lacks bounded journal snapshots; use --follow")
                })?);
            }
            let mut snapshot_done = false;
            if let Some(end) = snapshot {
                if page.length.is_some_and(|length| length < end) {
                    return Err(anyhow!("remote journal was truncated"));
                }
                let allowed = end.saturating_sub(cursor).min(page.bytes.len() as u64) as usize;
                snapshot_done = cursor + page.bytes.len() as u64 >= end;
                page.bytes.truncate(allowed);
                let complete = page
                    .bytes
                    .iter()
                    .rposition(|byte| *byte == b'\n')
                    .map_or(0, |index| index + 1);
                page.bytes.truncate(complete);
            }
            let empty = page.bytes.is_empty();
            if empty
                && page
                    .length
                    .is_some_and(|length| length.saturating_sub(cursor) > PAGE_BYTES as u64)
            {
                return Err(anyhow!(
                    "remote execution event exceeds 4 MiB or journal is invalid"
                ));
            }
            let events: Vec<Event> = page
                .bytes
                .split_inclusive(|byte| *byte == b'\n')
                .map(|line| {
                    serde_json::from_slice(line)
                        .map_err(|_| anyhow!("invalid remote execution event"))
                })
                .collect::<Result<_, _>>()?;
            cursor += page.bytes.len() as u64;
            display.remote_state(&state).map_err(|e| anyhow!(e))?;
            display.ingest(events).map_err(|e| anyhow!(e))?;
            let terminal = !matches!(state.as_str(), "queued" | "running");
            if (!follow && (snapshot_done || empty))
                || (follow
                    && terminal
                    && ((empty && terminal_seen) || display.completed().is_some()))
            {
                display.finish_display().map_err(|e| anyhow!(e))?;
                if matches!(state.as_str(), "failed" | "cancelled" | "interrupted") {
                    return Err(self
                        .failure()
                        .await
                        .unwrap_or_else(|| anyhow!("remote run {state}")));
                }
                if display.completed() == Some(false) {
                    return Err(self
                        .failure()
                        .await
                        .unwrap_or_else(|| anyhow!("remote pipeline failed or was cancelled")));
                }
                if follow && display.completed() != Some(true) {
                    return Err(anyhow!("terminal remote run has no complete finish event"));
                }
                return Ok(());
            }
            // State may become terminal after the event page was read. Fetch
            // once more before concluding that its finish event is missing.
            terminal_seen = terminal;
            if empty {
                tokio::time::sleep(Duration::from_millis(50)).await;
            } else {
                tokio::task::yield_now().await;
            }
        }
    }
}
fn number(headers: &HeaderMap, name: &str) -> Result<Option<u64>, Error> {
    headers
        .get(name)
        .map(|value| {
            let value = value
                .to_str()
                .map_err(|_| anyhow!("invalid remote cursor header"))?;
            if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
                return Err(anyhow!("invalid remote cursor header"));
            }
            value
                .parse()
                .map_err(|_| anyhow!("invalid remote cursor header"))
        })
        .transpose()
}
async fn body(mut response: Response, limit: usize) -> Result<Vec<u8>, Error> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(anyhow!("remote response exceeds byte limit"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| anyhow!("remote watch body read failed"))?
    {
        if chunk.len() > limit - bytes.len() {
            return Err(anyhow!("remote response exceeds byte limit"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub async fn watch(
    origin: &str,
    id: &str,
    mode: &str,
    follow: bool,
    timeout: Option<u64>,
) -> Result<(), Error> {
    let remote = Remote::new(origin, id)?;
    #[cfg(unix)]
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    #[cfg(unix)]
    let shutdown = async move {
        interrupt.recv().await;
        Ok::<(), std::io::Error>(())
    };
    #[cfg(not(unix))]
    let shutdown = tokio::signal::ctrl_c();
    let mut display = Progress::replay(mode).map_err(|e| anyhow!(e))?;
    tokio::select! {
        biased;
        signal = shutdown => { signal?; Ok(()) },
        result = remote.observe(&mut display, follow, timeout) => result,
    }
}
