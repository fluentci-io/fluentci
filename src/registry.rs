use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::{sync::LazyLock, time::Duration};

pub const API: &str = "https://api.fluentci.io/v1";
pub const PACKAGES: &str = "https://pkg.fluentci.io";
pub const RUNNER: &str = "https://whole-dove-21.deno.dev";
pub const EVENTS: &str = "https://events.fluentci.io";
pub const WEBSOCKET: &str = "wss://events.fluentci.io";

pub fn base_url() -> String {
    std::env::var("FLUENTCI_REGISTRY_URL")
        .unwrap_or_else(|_| "https://api.fluentci.io".into())
        .trim_end_matches('/')
        .into()
}

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
    pub author: Option<String>,
    pub url: Option<String>,
    pub sha256: Option<String>,
}

pub struct Resolved {
    pub name: String,
    pub version: String,
    pub metadata: Package,
}

impl Resolved {
    pub fn url(&self, file: &str) -> String {
        if file.is_empty()
            && let Some(url) = &self.metadata.url
        {
            return url.clone();
        }
        format!("{PACKAGES}/{}@{}/{}", self.name, self.version, file)
    }
}

pub async fn resolve(pipeline: &str) -> Result<Resolved> {
    #[derive(Deserialize)]
    struct Output {
        package: Package,
    }
    let (qualified, version) = pipeline.rsplit_once('@').unwrap_or((pipeline, "latest"));
    let (author, name) = qualified
        .rsplit_once('/')
        .map_or(("", qualified), |(author, name)| (author, name));
    let mut query = vec![("name", name)];
    if version != "latest" {
        query.push(("version", version));
    }
    if !author.is_empty() {
        query.push(("author", author));
    }
    let response = client()
        .get(format!(
            "{}/xrpc/io.fluentci.registry.getPackage",
            base_url()
        ))
        .query(&query)
        .send()
        .await?;
    if response.status() != reqwest::StatusCode::NOT_FOUND
        && response.status() != reqwest::StatusCode::METHOD_NOT_ALLOWED
    {
        let output: Output = response.error_for_status()?.json().await?;
        let version = output
            .package
            .version
            .clone()
            .context("Registry returned no version")?;
        return Ok(Resolved {
            name: qualified.into(),
            version,
            metadata: output.package,
        });
    }
    // Older registries still serve legacy TypeScript packages through /v1.
    let metadata: Package = client()
        .get(format!("{API}/pipeline/{name}"))
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
        packages: Vec<Package>,
    }
    anyhow::ensure!(
        (1..=100).contains(&limit),
        "Search limit must be between 1 and 100"
    );
    let response: Search = client()
        .get(format!(
            "{}/xrpc/io.fluentci.registry.searchPackages",
            base_url()
        ))
        .query(&[("q", query), ("limit", &limit.to_string())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    for p in &response.packages {
        let author = p
            .author
            .as_deref()
            .map(|value| format!("{value}/"))
            .unwrap_or_default();
        println!(
            "* {}{}@{} - {}",
            author,
            p.name.as_deref().unwrap_or_default(),
            p.version.as_deref().unwrap_or_default(),
            p.description.as_deref().unwrap_or_default()
        );
    }
    if response.packages.is_empty() {
        println!("No results found for {query}");
    }
    Ok(())
}

pub async fn wasm_artifact(package: &Resolved) -> Result<std::path::PathBuf> {
    let expected = package
        .metadata
        .sha256
        .as_deref()
        .context("Registry returned no Wasm checksum")?;
    anyhow::ensure!(
        expected.len() == 64 && expected.bytes().all(|b| b.is_ascii_hexdigit()),
        "Invalid Wasm checksum"
    );
    let directory = std::env::var_os("FLUENTCI_PACKAGE_CACHE")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::cache_dir().map(|p| p.join("fluentci/packages")))
        .context("Cache directory unavailable")?;
    let artifact = directory.join(format!("{expected}.wasm"));
    if let Ok(bytes) = tokio::fs::read(&artifact).await
        && sha256::digest(bytes.as_slice()) == expected
        && crate::publishing::validate_wasm(&bytes).is_ok()
    {
        return Ok(artifact);
    }
    let bytes = crate::publishing::download(
        package
            .metadata
            .url
            .as_deref()
            .context("Missing Wasm download URL")?,
    )
    .await?;
    anyhow::ensure!(
        sha256::digest(bytes.as_slice()) == expected,
        "Wasm artifact does not match its published checksum"
    );
    tokio::fs::create_dir_all(&directory).await?;
    let mut file = tempfile::NamedTempFile::new_in(&directory)?;
    std::io::Write::write_all(&mut file, &bytes)?;
    file.persist(&artifact)?;
    Ok(artifact)
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
