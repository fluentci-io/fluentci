use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::{sync::LazyLock, time::Duration};

pub const API: &str = "https://api.fluentci.io/v1";
pub const PACKAGES: &str = "https://pkg.fluentci.io";
pub const RUNNER: &str = "https://whole-dove-21.deno.dev";
pub const EVENTS: &str = "https://events.fluentci.io";
pub const WEBSOCKET: &str = "wss://events.fluentci.io";

pub fn client() -> &'static reqwest::Client {
    static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
        reqwest::Client::builder()
            .user_agent(concat!("fluentci/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .build()
            .expect("valid HTTP client configuration")
    });
    &CLIENT
}

#[derive(Debug, Deserialize)]
pub struct Package {
    pub name: Option<String>,
    pub version: Option<String>,
    pub default_branch: Option<String>,
    pub description: Option<String>,
    pub github_url: Option<String>,
    pub directory: Option<String>,
}

pub struct Resolved {
    pub name: String,
    pub version: String,
    pub metadata: Package,
}

impl Resolved {
    pub fn url(&self, file: &str) -> String {
        format!("{PACKAGES}/{}@{}/{}", self.name, self.version, file)
    }
}

pub async fn resolve(pipeline: &str) -> Result<Resolved> {
    let (name, version) = pipeline.split_once('@').unwrap_or((pipeline, "latest"));
    let url = format!("{API}/pipeline/{name}");
    let metadata: Package = client()
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if metadata.github_url.is_none() && metadata.version.is_none() {
        bail!("Pipeline {name:?} not found in FluentCI registry");
    }
    let version = if version == "latest" {
        metadata
            .version
            .as_deref()
            .or(metadata.default_branch.as_deref())
            .context("Registry returned no version")?
    } else {
        version
    };
    Ok(Resolved {
        name: name.into(),
        version: version.into(),
        metadata,
    })
}

pub async fn search(query: &str, limit: u32) -> Result<()> {
    #[derive(Deserialize)]
    struct Search {
        results: Vec<Package>,
    }
    let response: Search = client()
        .get("https://search.fluentci.io")
        .query(&[("q", query), ("limit", &limit.to_string())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    for p in &response.results {
        println!(
            "* {}@{} - {}",
            p.name.as_deref().unwrap_or_default(),
            p.version
                .as_deref()
                .or(p.default_branch.as_deref())
                .unwrap_or_default(),
            p.description.as_deref().unwrap_or_default()
        );
    }
    if response.results.is_empty() {
        println!("No results found for {query}");
    }
    Ok(())
}

/// Check at most once a day; registry availability never prevents CLI use.
pub async fn check_update(db: &crate::db::Db) -> Result<()> {
    let today = chrono::Utc::now().date_naive().to_string();
    if db.setting("update_checked_on").await?.as_deref() == Some(&today) {
        return Ok(());
    }
    db.set_setting("update_checked_on", &today).await?;
    let response = tokio::time::timeout(Duration::from_secs(2), async {
        client()
            .get("https://api.github.com/repos/fluentci-io/fluentci/releases/latest")
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await
    })
    .await??;
    if let Some(tag) = response["tag_name"].as_str()
        && tag.trim_start_matches('v') != env!("CARGO_PKG_VERSION")
    {
        eprintln!("Latest published FluentCI release: {tag}; run fluentci upgrade to install it");
    }
    Ok(())
}
