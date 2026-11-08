use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::{
    sync::LazyLock,
    time::{Duration, Instant},
};

pub const OFFICIAL_AUTHOR: &str = "fluentci.io";

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

#[derive(Debug, Clone, Default, serde::Serialize, Deserialize)]
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
    pub uri: Option<String>,
    pub cid: Option<String>,
    pub repository: Option<String>,
    pub logo: Option<String>,
    pub subdir: Option<String>,
    #[serde(rename = "readmeUrl", alias = "readme_url")]
    pub readme_url: Option<String>,
    pub functions: Option<Vec<crate::plugin_metadata::Function>>,
    pub topics: Option<Vec<String>>,
    pub os: Option<Vec<String>>,
    pub arch: Option<Vec<String>>,
}

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
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

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct PackageReference<'a> {
    pub qualified: &'a str,
    pub name: &'a str,
    pub author: &'a str,
    pub version: &'a str,
    pub scoped: bool,
}

pub(crate) fn package_reference(value: &str) -> Result<PackageReference<'_>> {
    let explicitly_scoped = value.starts_with('@');
    let body = value.strip_prefix('@').unwrap_or(value);
    let (qualified, version) = body.rsplit_once('@').unwrap_or((body, "latest"));
    let scoped = explicitly_scoped
        || !qualified.contains('/')
        || qualified.split_once('/').is_some_and(|(author, _)| {
            author.contains('.') && !author.starts_with('.') && !author.ends_with('.')
        });
    let (author, name) = qualified.rsplit_once('/').unwrap_or((
        if explicitly_scoped {
            ""
        } else {
            OFFICIAL_AUTHOR
        },
        qualified,
    ));
    anyhow::ensure!(
        !name.is_empty() && !version.is_empty(),
        "Expected @handle/module[@version]"
    );
    if scoped {
        anyhow::ensure!(
            !author.is_empty() && !author.contains('/') && !author.chars().any(char::is_whitespace),
            "Expected @handle/module[@version]"
        );
        anyhow::ensure!(
            author.contains('.') || author.starts_with("did:"),
            "Registry publishers use AT Protocol handles, e.g. fluentci.io, rather than GitHub organization names. Use fluentci.io/{name} or {name} for official modules"
        );
        anyhow::ensure!(
            name.len() <= 64
                && name.as_bytes()[0].is_ascii_lowercase()
                && name
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-'),
            "Invalid registry module name"
        );
    }
    let version = if version == "latest" {
        version
    } else {
        version.strip_prefix('v').unwrap_or(version)
    };
    if scoped && version != "latest" {
        let parsed = semver::Version::parse(version)
            .context("Expected an exact SemVer version or latest")?;
        anyhow::ensure!(
            parsed.build.is_empty(),
            "Package versions cannot include build metadata"
        );
    }
    Ok(PackageReference {
        qualified,
        name,
        author,
        version,
        scoped,
    })
}

pub async fn resolve(pipeline: &str) -> Result<Resolved> {
    let parsed = package_reference(pipeline)?;
    let key = format!(
        "{}:@{}/{}@{}",
        base_url(),
        parsed.author,
        parsed.name,
        parsed.version
    );
    let _guard = crate::dependency_cache::guard("resolve", &key).await?;
    let path = crate::dependency_cache::directory()?
        .join("metadata")
        .join(format!("{}.json", sha256::digest(&key)));
    if let Ok(metadata) = tokio::fs::metadata(&path).await
        && metadata.modified()?.elapsed().unwrap_or_default() < Duration::from_secs(30)
        && let Ok(bytes) = tokio::fs::read(&path).await
        && let Ok(resolved) = serde_json::from_slice(&bytes)
    {
        return Ok(resolved);
    }
    let resolved = resolve_fresh(pipeline).await?;
    crate::dependency_cache::atomic_write(&path, &serde_json::to_vec(&resolved)?)?;
    Ok(resolved)
}

pub(crate) async fn resolve_fresh(pipeline: &str) -> Result<Resolved> {
    resolve_at(pipeline, &base_url()).await
}

pub(crate) async fn resolve_at(pipeline: &str, registry_url: &str) -> Result<Resolved> {
    #[derive(Deserialize)]
    struct Output {
        package: Package,
    }
    let reference = package_reference(pipeline)?;
    let PackageReference {
        qualified,
        name,
        author,
        version,
        scoped,
    } = reference;
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
            registry_url.trim_end_matches('/')
        ))
        .query(&query)
        .send()
        .await?;
    if scoped
        || response.status() != reqwest::StatusCode::NOT_FOUND
            && response.status() != reqwest::StatusCode::METHOD_NOT_ALLOWED
    {
        let output: Output = response.error_for_status()?.json().await?;
        let version = output
            .package
            .version
            .clone()
            .context("Registry returned no version")?;
        return Ok(Resolved {
            name: if scoped {
                format!("@{author}/{name}")
            } else {
                qualified.into()
            },
            version,
            metadata: output.package,
        });
    }
    let version = pipeline
        .rsplit_once('@')
        .map_or("latest", |(_, version)| version);
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

pub async fn search_packages_at(
    query: &str,
    limit: u32,
    registry_url: &str,
) -> Result<Vec<Package>> {
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
            registry_url.trim_end_matches('/')
        ))
        .query(&[("q", query), ("limit", &limit.to_string())])
        .timeout(Duration::from_secs(8))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(response.packages)
}

/// Resolve the official publisher through the registry's verified actor lookup.
pub async fn official_author_at(registry_url: &str) -> Result<Option<String>> {
    static CACHE: LazyLock<tokio::sync::RwLock<Option<(String, String, Instant)>>> =
        LazyLock::new(|| tokio::sync::RwLock::new(None));
    if let Some((url, author, saved)) = CACHE.read().await.as_ref()
        && url == registry_url
        && saved.elapsed() < Duration::from_secs(60)
    {
        return Ok(Some(author.clone()));
    }
    #[derive(Deserialize)]
    struct Page {
        packages: Vec<Package>,
    }
    let page: Page = client()
        .get(format!(
            "{}/xrpc/io.fluentci.registry.getActorPackages",
            registry_url.trim_end_matches('/')
        ))
        .query(&[("actor", OFFICIAL_AUTHOR), ("limit", "1")])
        .timeout(Duration::from_secs(3))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let author = page
        .packages
        .into_iter()
        .next()
        .and_then(|package| package.author);
    if let Some(author) = &author {
        *CACHE.write().await = Some((registry_url.into(), author.clone(), Instant::now()));
    }
    Ok(author)
}

pub async fn search(query: &str, limit: u32) -> Result<()> {
    let registry_url = base_url();
    let packages = search_packages_at(query, limit, &registry_url).await?;
    let official = official_author_at(&registry_url).await.unwrap_or_default();
    for p in &packages {
        let author = p
            .author
            .as_deref()
            .filter(|value| Some(*value) != official.as_deref() && *value != OFFICIAL_AUTHOR)
            .map(|value| format!("@{value}/"))
            .unwrap_or_default();
        println!(
            "* {}{}@{} - {}",
            author,
            p.name.as_deref().unwrap_or_default(),
            p.version.as_deref().unwrap_or_default(),
            p.description.as_deref().unwrap_or_default()
        );
    }
    if packages.is_empty() {
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
    let _guard = crate::dependency_cache::guard("artifact", &artifact.to_string_lossy()).await?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json, Router, extract::Query, routing::get};
    use std::collections::HashMap;

    #[test]
    fn scoped_package_references_support_pinned_and_latest_versions() -> Result<()> {
        for (input, version) in [
            ("@tsiry-sandratraina.com/sccache@v0.1.0", "0.1.0"),
            ("@tsiry-sandratraina.com/sccache@0.1.0", "0.1.0"),
            ("@tsiry-sandratraina.com/sccache@latest", "latest"),
            ("@tsiry-sandratraina.com/sccache", "latest"),
            ("tsiry-sandratraina.com/sccache", "latest"),
            ("tsiry-sandratraina.com/sccache@v0.1.0", "0.1.0"),
        ] {
            let reference = package_reference(input)?;
            assert_eq!(reference.name, "sccache");
            assert_eq!(reference.author, "tsiry-sandratraina.com");
            assert_eq!(reference.version, version);
        }
        for invalid in [
            "@fluentci-io/setup-node",
            "@handle",
            "@/module",
            "@handle/",
            "@handle/module@",
            "@handle/module@main",
            "@handle/one/two",
        ] {
            assert!(package_reference(invalid).is_err(), "{invalid}");
        }
        Ok(())
    }

    #[test]
    fn official_references_support_omitted_handles() -> Result<()> {
        for input in [
            "sccache",
            "sccache@latest",
            "sccache@v0.1.0",
            "sccache@0.1.0",
        ] {
            let reference = package_reference(input)?;
            assert_eq!(reference.author, OFFICIAL_AUTHOR);
            assert_eq!(reference.name, "sccache");
            assert!(reference.scoped);
        }
        for invalid in [
            "sccache@main",
            "sccache@",
            "sccache@1.0.0+build",
            "sccache with spaces",
        ] {
            assert!(package_reference(invalid).is_err());
        }
        Ok(())
    }

    #[tokio::test]
    async fn official_resolution_always_qualifies_the_publisher() -> Result<()> {
        let router = Router::new().route("/xrpc/io.fluentci.registry.getPackage", get(|Query(query): Query<HashMap<String, String>>| async move {
            assert_eq!(query.get("author").map(String::as_str), Some(OFFICIAL_AUTHOR));
            assert_eq!(query.get("name").map(String::as_str), Some("sccache"));
            Json(serde_json::json!({"package":{"name":"sccache","version":"0.1.0","url":"https://example.com/sccache.wasm"}}))
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let server = tokio::spawn(async move { axum::serve(listener, router).await });
        for input in [
            "sccache",
            "sccache@v0.1.0",
            "@fluentci.io/sccache@0.1.0",
            "fluentci.io/sccache@0.1.0",
        ] {
            let package = resolve_at(input, &format!("http://{address}")).await?;
            assert_eq!(package.name, "@fluentci.io/sccache");
        }
        server.abort();
        Ok(())
    }

    #[tokio::test]
    async fn scoped_references_send_the_canonical_author_and_version_to_xrpc() -> Result<()> {
        let router = Router::new().route("/xrpc/io.fluentci.registry.getPackage", get(|Query(query): Query<HashMap<String, String>>| async move {
            assert_eq!(query.get("author").map(String::as_str), Some("tsiry-sandratraina.com"));
            assert_eq!(query.get("name").map(String::as_str), Some("sccache"));
            assert!(query.get("version").is_none_or(|version| version == "0.1.0"));
            Json(serde_json::json!({"package": {"name":"sccache","version":"0.1.0","url":"https://example.com/sccache.wasm"}}))
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let server = tokio::spawn(async move { axum::serve(listener, router).await });
        for reference in [
            "@tsiry-sandratraina.com/sccache@v0.1.0",
            "@tsiry-sandratraina.com/sccache@latest",
            "@tsiry-sandratraina.com/sccache",
        ] {
            let package = resolve_at(reference, &format!("http://{address}")).await?;
            assert_eq!(package.version, "0.1.0");
            assert_eq!(
                package.metadata.url.as_deref(),
                Some("https://example.com/sccache.wasm")
            );
        }
        server.abort();
        Ok(())
    }
}
