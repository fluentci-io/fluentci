//! Environment-based AT Protocol authentication with in-memory Jacquard sessions.

use crate::{
    account::{self, AccountIdentity},
    db::Db,
    tangled,
};
use anyhow::{Context, Result};
use jacquard::{
    api::com_atproto::server::{get_service_auth::GetServiceAuth, get_session::GetSession},
    client::{AtpSession, MemoryCredentialSession},
    deps::fluent_uri::Uri,
    prelude::XrpcClient,
    types::string::{Did, Handle, Nsid},
};
use std::time::Duration;

pub const AUTH_HELP: &str = "Set FLUENTCI_ACCOUNT to your handle or DID and FLUENTCI_APP_PASSWORD to your account app password.";

pub struct Publisher {
    pub session: MemoryCredentialSession,
    pub identity: AtpSession,
}

pub async fn authenticate_with(
    account: &str,
    password: &str,
    pds: Option<&str>,
) -> Result<Publisher> {
    if account.starts_with("did:") {
        Did::new(account)?;
    } else {
        Handle::new(account)?;
    }
    anyhow::ensure!(!password.trim().is_empty(), "{AUTH_HELP}");
    let endpoint = pds
        .map(|value| -> Result<Uri<String>> {
            let url = reqwest::Url::parse(value)?;
            anyhow::ensure!(
                url.scheme() == "https"
                    || (url.scheme() == "http"
                        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))),
                "PDS URL must use HTTPS (HTTP is allowed on loopback)"
            );
            anyhow::ensure!(
                url.username().is_empty()
                    && url.password().is_none()
                    && url.query().is_none()
                    && url.fragment().is_none(),
                "Invalid PDS URL"
            );
            Ok(Uri::parse(value)?.to_owned())
        })
        .transpose()?;
    let (session, identity) = tokio::time::timeout(
        Duration::from_secs(30),
        MemoryCredentialSession::authenticated(account, password, None, endpoint),
    )
    .await
    .context("Account authentication timed out")?
    .map_err(|_| anyhow::anyhow!("AT Protocol authentication failed. {AUTH_HELP}"))?;
    anyhow::ensure!(
        !account.starts_with("did:") || identity.did.as_str() == account,
        "Authenticated account DID did not match FLUENTCI_ACCOUNT"
    );
    let info = session.send(GetSession).await?.into_output()?;
    anyhow::ensure!(info.active != Some(false), "The account is inactive");
    Ok(Publisher { session, identity })
}

pub async fn authenticate(db: &Db) -> Result<Publisher> {
    let account = std::env::var("FLUENTCI_ACCOUNT").unwrap_or_default();
    let password = std::env::var("FLUENTCI_APP_PASSWORD").unwrap_or_default();
    anyhow::ensure!(
        !account.trim().is_empty() && !password.trim().is_empty(),
        "You are not logged in. {AUTH_HELP}"
    );
    let publisher = authenticate_with(
        account.trim(),
        &password,
        std::env::var("FLUENTCI_PDS_URL").ok().as_deref(),
    )
    .await?;
    let identity = AccountIdentity {
        account: account.trim().into(),
        did: publisher.identity.did.to_string(),
        handle: publisher.identity.handle.to_string(),
        pds: publisher.session.endpoint().await.to_string(),
    };
    let path = account::path()?;
    account::save(&path, &identity)?;
    if let Err(error) = tangled::schedule(db, &identity, &path).await {
        tracing::debug!(%error, "Could not schedule Tangled repository sync");
    }
    Ok(publisher)
}

impl Publisher {
    pub async fn upload_token(&self) -> Result<String> {
        let request = GetServiceAuth {
            aud: std::env::var("FLUENTCI_REGISTRY_DID")
                .unwrap_or_else(|_| "did:web:api.fluentci.io".into()),
            // Scoped to this upload method; allow slow transfers to reach the API.
            exp: Some(chrono::Utc::now().timestamp() + 15 * 60),
            lxm: Some(Nsid::new("io.fluentci.registry.publish".to_owned())?),
        };
        Ok(self
            .session
            .send(request)
            .await?
            .into_output()?
            .token
            .to_string())
    }
}

pub async fn whoami(db: &Db) -> Result<()> {
    if std::env::var("FLUENTCI_ACCOUNT")
        .unwrap_or_default()
        .trim()
        .is_empty()
        || std::env::var("FLUENTCI_APP_PASSWORD")
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        println!("You are not logged in. {AUTH_HELP}");
        return Ok(());
    }
    let publisher = authenticate(db).await?;
    println!(
        "You are logged in as {} ({})",
        publisher.identity.handle, publisher.identity.did
    );
    Ok(())
}
