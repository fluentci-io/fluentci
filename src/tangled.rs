//! A detached, bounded public-PDS repository index for Studio suggestions.

use crate::{
    account::{self, AccountIdentity},
    db::Db,
    registry,
};
use anyhow::{Context, Result};
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::{
    collections::HashSet,
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct TangledRepository {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub clone_url: String,
    pub author: String,
    pub knot: String,
}

pub async fn schedule(db: &Db, identity: &AccountIdentity, account_file: &Path) -> Result<()> {
    if std::env::var("FLUENTCI_TANGLED_SYNC").as_deref() == Ok("false")
        || !db.acquire_tangled_sync(&identity.did).await?
    {
        return Ok(());
    }
    let mut command = Command::new(crate::process::current_exe()?);
    command
        .args(["--check-update=false", "--database"])
        .arg(db.filename())
        .args(["__index-tangled", "--account-file"])
        .arg(account_file)
        .args(["--did", &identity.did])
        .env_remove("FLUENTCI_APP_PASSWORD")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    command.process_group(0);
    if let Err(error) = command.spawn() {
        db.fail_tangled_sync(&identity.did, "Could not launch the background worker")
            .await?;
        return Err(error.into());
    }
    Ok(())
}

pub fn repository(
    identity: &AccountIdentity,
    uri: &str,
    value: &serde_json::Value,
) -> Result<TangledRepository> {
    anyhow::ensure!(
        uri.starts_with(&format!("at://{}/sh.tangled.repo/", identity.did)),
        "Repository belongs to another account"
    );
    anyhow::ensure!(
        value["$type"] == "sh.tangled.repo",
        "Not a Tangled repository record"
    );
    let name = value["name"].as_str().context("Repository has no name")?;
    anyhow::ensure!(
        !name.is_empty()
            && name.len() <= 256
            && !matches!(name, "." | "..")
            && !name.contains(['/', '\\', '\0']),
        "Invalid repository name"
    );
    let knot = value["knot"].as_str().context("Repository has no knot")?;
    let host = knot.strip_prefix("did:web:").unwrap_or(knot);
    let origin = if host.starts_with("https://") {
        host.to_owned()
    } else {
        format!("https://{}", host.replace("%3A", ":").replace("%3a", ":"))
    };
    let mut url = reqwest::Url::parse(&origin)?;
    anyhow::ensure!(
        url.scheme() == "https"
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "Invalid knot URL"
    );
    let mut parts = url
        .path_segments_mut()
        .map_err(|_| anyhow::anyhow!("Invalid knot URL"))?;
    parts.clear();
    if let Some(repo_did) = value["repoDid"].as_str() {
        jacquard::types::string::Did::new(repo_did)?;
        parts.push(repo_did);
    } else {
        parts.push(&identity.did).push(name);
    }
    drop(parts);
    Ok(TangledRepository {
        uri: uri.into(),
        name: name.into(),
        description: value["description"].as_str().unwrap_or_default().into(),
        clone_url: url.into(),
        author: identity.did.clone(),
        knot: knot.into(),
    })
}

pub async fn fetch(identity: &AccountIdentity) -> Result<Vec<TangledRepository>> {
    let pds = reqwest::Url::parse(&identity.pds)?;
    anyhow::ensure!(
        pds.scheme() == "https"
            || (pds.scheme() == "http"
                && matches!(pds.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))),
        "Invalid PDS URL"
    );
    let endpoint = format!(
        "{}/xrpc/com.atproto.repo.listRecords",
        identity.pds.trim_end_matches('/')
    );
    let mut repositories = Vec::new();
    let mut cursor = String::new();
    let mut seen = HashSet::new();
    loop {
        let mut request = registry::client()
            .get(&endpoint)
            .timeout(Duration::from_secs(20))
            .query(&[
                ("repo", identity.did.as_str()),
                ("collection", "sh.tangled.repo"),
                ("limit", "100"),
            ]);
        if !cursor.is_empty() {
            request = request.query(&[("cursor", &cursor)]);
        }
        let data: serde_json::Value = request.send().await?.error_for_status()?.json().await?;
        let records = data["records"]
            .as_array()
            .context("PDS returned no records array")?;
        for record in records {
            let Some(uri) = record["uri"].as_str() else {
                continue;
            };
            if let Ok(repo) = repository(identity, uri, &record["value"]) {
                repositories.push(repo);
            }
        }
        let next = data["cursor"].as_str().unwrap_or_default();
        if next.is_empty() {
            break;
        }
        anyhow::ensure!(
            seen.insert(next.to_owned()) && seen.len() <= 1000,
            "PDS returned invalid or excessive pagination"
        );
        cursor = next.into();
    }
    Ok(repositories)
}

pub async fn index(db: &Db, account_file: &Path, did: &str) -> Result<()> {
    let result = async {
        let identity = account::read(account_file)?.context("No remembered account")?;
        anyhow::ensure!(
            identity.did == did,
            "The active account changed before sync started"
        );
        let repositories = tokio::time::timeout(Duration::from_secs(120), fetch(&identity))
            .await
            .context("Tangled sync timed out")??;
        db.replace_tangled_repositories(did, &repositories).await
    }
    .await;
    if result.is_err() {
        db.fail_tangled_sync(did, "Repository sync failed; authenticate again to retry")
            .await?;
    }
    result
}
