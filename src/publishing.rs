//! Publish verified Wasm artifacts and AT Protocol package records.

use crate::{auth, config, db::Db, modules, registry, workspace::Workspace};
use anyhow::{Context, Result};
use jacquard::{
    api::com_atproto::repo::create_record::CreateRecord,
    prelude::XrpcClient,
    types::{
        ident::AtIdentifier,
        recordkey::RecordKey,
        string::{Did, Nsid},
    },
};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};

pub const COLLECTION: &str = "io.fluentci.plugin";
pub const MAX_WASM_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRecord {
    #[serde(rename = "$type")]
    pub record_type: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub published_at: String,
    pub author: String,
    pub license: String,
    pub url: String,
    pub sha256: String,
    pub size: usize,
}

#[derive(Deserialize)]
struct Upload {
    url: String,
    sha256: String,
    size: usize,
}

pub fn validate_metadata(
    name: &str,
    version: &str,
    description: &str,
    license: &str,
) -> Result<()> {
    anyhow::ensure!(
        !name.is_empty()
            && name.len() <= 64
            && name.as_bytes()[0].is_ascii_lowercase()
            && name
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-'),
        "Package names must start with a lowercase letter and contain only lowercase letters, digits, or hyphens (maximum 64 characters)"
    );
    let parsed = semver::Version::parse(version).context("Package version must be valid SemVer")?;
    anyhow::ensure!(
        version.len() <= 128 && parsed.build.is_empty(),
        "Package versions cannot include +build metadata because it is not allowed in record keys"
    );
    anyhow::ensure!(
        description.chars().count() <= 2048,
        "Description is too long"
    );
    anyhow::ensure!(
        !license.trim().is_empty() && license.len() <= 128,
        "Set package.license in fluentci.toml (for example MIT or MPL-2.0)"
    );
    Ok(())
}

pub fn wasm_url(value: &str) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(value).context("Invalid Wasm URL")?;
    anyhow::ensure!(
        matches!(url.scheme(), "https" | "http")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path().ends_with(".wasm"),
        "Wasm URL must use HTTP(S) and end with .wasm, without credentials, query parameters, or a fragment"
    );
    Ok(url)
}

pub fn validate_wasm(bytes: &[u8]) -> Result<()> {
    anyhow::ensure!(
        (8..=MAX_WASM_BYTES).contains(&bytes.len()) && bytes.starts_with(b"\0asm\x01\0\0\0"),
        "Expected a Wasm module of at most 64 MiB"
    );
    wasmparser::Validator::new()
        .validate_all(bytes)
        .context("Invalid Wasm module")?;
    Ok(())
}

pub async fn download(value: &str) -> Result<Vec<u8>> {
    let url = wasm_url(value)?;
    let mut response = registry::client()
        .get(url)
        .timeout(Duration::from_secs(60))
        .send()
        .await?;
    anyhow::ensure!(
        response.status() == reqwest::StatusCode::OK,
        "Wasm URL must return HTTP 200 (received {})",
        response.status()
    );
    wasm_url(response.url().as_str())?;
    anyhow::ensure!(
        response.content_length().unwrap_or(0) <= MAX_WASM_BYTES as u64,
        "Wasm exceeds the 64 MiB size limit"
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        anyhow::ensure!(
            bytes.len() + chunk.len() <= MAX_WASM_BYTES,
            "Wasm exceeds the 64 MiB size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    validate_wasm(&bytes)?;
    Ok(bytes)
}

fn metadata(root: &Path) -> Result<(String, String, String, String)> {
    let package = config::find(root)
        .map(|path| config::Config::read(&path))
        .transpose()?
        .and_then(|c| c.package);
    let cargo = [root.join("Cargo.toml"), root.join("plugin/Cargo.toml")]
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| -> Result<toml::Value> { Ok(toml::from_str(&std::fs::read_to_string(p)?)?) })
        .transpose()?;
    let cargo_field = |name: &str| {
        cargo
            .as_ref()
            .and_then(|c| c.get("package"))
            .and_then(|p| p.get(name))
            .and_then(|v| v.as_str())
            .map(str::to_owned)
    };
    let name = package
        .as_ref()
        .map(|p| p.name.clone())
        .or_else(|| cargo_field("name"))
        .context("Set package.name in fluentci.toml")?;
    let version = package
        .as_ref()
        .map(|p| p.version.clone())
        .or_else(|| cargo_field("version"))
        .context("Set package.version in fluentci.toml")?;
    let description = package
        .as_ref()
        .and_then(|p| p.description.clone())
        .or_else(|| cargo_field("description"))
        .unwrap_or_default();
    let license = package
        .as_ref()
        .and_then(|p| p.license.clone())
        .or_else(|| cargo_field("license"))
        .unwrap_or_default();
    validate_metadata(&name, &version, &description, &license)?;
    Ok((name, version, description, license))
}

pub async fn publish(
    db: &Db,
    external: Option<&str>,
    file: Option<&Path>,
    module: Option<&str>,
) -> Result<()> {
    let workspace = Workspace::current()?;
    let (name, version, description, license) = metadata(&workspace.root)?;
    let bytes = if let Some(url) = external {
        download(url).await?
    } else {
        let artifact = if let Some(file) = file {
            file.to_path_buf()
        } else if let Some(path) = workspace.config.as_ref() {
            let modules = modules::discover(&workspace)?;
            let selected = if let Some(name) = module {
                modules
                    .iter()
                    .find(|m| m.name == name)
                    .context("Module not found")?
            } else {
                anyhow::ensure!(
                    modules.len() == 1,
                    "Specify --module when the project declares multiple modules"
                );
                modules.first().context("No modules configured")?
            };
            let _ = path;
            selected.prepare().await?
        } else {
            let manifest = ["plugin/Cargo.toml", "Cargo.toml"]
                .into_iter()
                .map(|p| workspace.root.join(p))
                .find(|p| p.is_file())
                .context("Specify --file, --url, or configure a module")?;
            modules::build(&manifest).await?
        };
        anyhow::ensure!(
            tokio::fs::metadata(&artifact).await?.len() <= MAX_WASM_BYTES as u64,
            "Wasm exceeds the 64 MiB size limit"
        );
        tokio::fs::read(artifact).await?
    };
    validate_wasm(&bytes)?;
    let publisher = auth::authenticate(db).await?;
    let digest = sha256::digest(bytes.as_slice());
    let size = bytes.len();
    let url = if let Some(url) = external {
        url.to_owned()
    } else {
        let token = publisher.upload_token().await?;
        let response = registry::client()
            .post(format!(
                "{}/xrpc/io.fluentci.registry.publish",
                registry::base_url()
            ))
            .bearer_auth(token)
            .header("Content-Type", "application/wasm")
            .body(bytes)
            .timeout(Duration::from_secs(120))
            .send()
            .await?;
        let upload: Upload = response.error_for_status()?.json().await?;
        wasm_url(&upload.url)?;
        anyhow::ensure!(
            upload.sha256 == digest && upload.size == size,
            "Registry upload checksum or size did not match the Wasm artifact"
        );
        upload.url
    };
    let record = PluginRecord {
        record_type: COLLECTION.into(),
        name,
        description,
        version,
        published_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        author: publisher.identity.did.to_string(),
        license,
        url,
        sha256: digest,
        size,
    };
    let key = format!("{}-{}", record.name, record.version);
    let request: CreateRecord<String> = CreateRecord {
        repo: AtIdentifier::Did(Did::new(record.author.clone())?),
        collection: Nsid::new(COLLECTION.to_owned())?,
        record: serde_json::from_value(serde_json::to_value(&record)?)?,
        rkey: Some(RecordKey::any_owned(&key)?),
        swap_commit: None,
        validate: Some(false),
        extra_data: None,
    };
    let output = publisher.session.send(request).await.context("Could not publish the plugin record to the PDS; existing name-version records are not overwritten")?.into_output()?;
    println!(
        "Published {}@{}\nRecord: {}\nWasm: {}",
        record.name, record.version, output.uri, record.url
    );
    Ok(())
}
