use super::error::{Failure, Result};
use axum::http::StatusCode;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

pub(super) struct Aliases {
    endpoint: reqwest::Url,
    client: reqwest::Client,
    handles: Mutex<HashMap<String, (String, Instant)>>,
    lookup: Mutex<()>,
}

#[derive(Deserialize)]
struct Identity {
    owner: String,
    #[serde(rename = "cacheId")]
    cache_id: String,
}

pub(super) fn valid_did(did: &str) -> bool {
    if let Some(id) = did.strip_prefix("did:plc:") {
        id.len() == 24
            && id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || (b'2'..=b'7').contains(&b))
    } else if let Some(id) = did.strip_prefix("did:web:") {
        !id.is_empty()
            && id.len() <= 1024
            && id.split(':').all(|part| !part.is_empty())
            && id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._:%-".contains(&b))
    } else {
        false
    }
}

fn valid_handle(handle: &str) -> bool {
    let labels: Vec<_> = handle.split('.').collect();
    handle.len() <= 253
        && labels.len() >= 2
        && labels
            .last()
            .is_some_and(|part| part.as_bytes().first().is_some_and(u8::is_ascii_alphabetic))
        && labels.iter().all(|part| {
            !part.is_empty()
                && part.len() <= 63
                && !part.starts_with('-')
                && !part.ends_with('-')
                && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
}

pub(super) fn legacy_account(did: &str) -> String {
    hex::encode(Sha256::digest(did.as_bytes()))
}

impl Aliases {
    pub(super) fn new(endpoint: &str) -> anyhow::Result<Self> {
        Ok(Self {
            endpoint: reqwest::Url::parse(endpoint)?,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            handles: Mutex::new(HashMap::new()),
            lookup: Mutex::new(()),
        })
    }

    pub(super) async fn account(&self, actor: &str) -> Result<String> {
        let decoded;
        let actor = if let Some(id) = actor.strip_prefix("did-plc-") {
            decoded = format!("did:plc:{id}");
            decoded.as_str()
        } else if let Some(id) = actor.strip_prefix("did-web-") {
            decoded = hex::decode(id)
                .ok()
                .and_then(|value| String::from_utf8(value).ok())
                .map(|value| format!("did:web:{value}"))
                .ok_or(Failure(StatusCode::BAD_REQUEST, "invalid registry DID\n"))?;
            decoded.as_str()
        } else {
            actor
        };
        if actor.starts_with("did:") {
            return if valid_did(actor) {
                Ok(actor.to_owned())
            } else {
                Err(Failure(StatusCode::BAD_REQUEST, "invalid account DID\n"))
            };
        }
        let actor = actor
            .strip_prefix('@')
            .unwrap_or(actor)
            .to_ascii_lowercase();
        let legacy = actor.len() == 64 && actor.bytes().all(|c| c.is_ascii_hexdigit());
        if !legacy && !valid_handle(&actor) {
            return Err(Failure(StatusCode::BAD_REQUEST, "invalid cache account\n"));
        }
        let _lookup = tokio::time::timeout(Duration::from_secs(10), self.lookup.lock())
            .await
            .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "identity lookup timed out\n"))?;
        if let Some((owner, _)) = self
            .handles
            .lock()
            .await
            .get(&actor)
            .cloned()
            .filter(|(_, expires)| *expires > Instant::now())
        {
            return Ok(owner);
        }
        let unavailable = || Failure(StatusCode::BAD_GATEWAY, "identity resolver unavailable\n");
        let mut url = self.endpoint.clone();
        url.query_pairs_mut().append_pair("actor", &actor);
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| unavailable())?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(Failure(StatusCode::NOT_FOUND, "cache account not found\n"));
        }
        if !response.status().is_success() {
            return Err(unavailable());
        }
        let data = response.bytes().await.map_err(|_| unavailable())?;
        if data.len() > 8192 {
            return Err(unavailable());
        }
        let identity: Identity = serde_json::from_slice(&data).map_err(|_| unavailable())?;
        if !valid_did(&identity.owner)
            || legacy_account(&identity.owner) != identity.cache_id
            || (legacy && identity.cache_id != actor)
        {
            return Err(unavailable());
        }
        let mut handles = self.handles.lock().await;
        handles.retain(|_, (_, expires)| *expires > Instant::now());
        if handles.len() >= 1024 {
            handles.clear();
        }
        handles.insert(
            actor,
            (
                identity.owner.clone(),
                Instant::now() + Duration::from_secs(60),
            ),
        );
        Ok(identity.owner)
    }

    pub(super) async fn canonical(&self, raw: &str) -> Result<Option<String>> {
        let scoped = raw.strip_prefix("accounts/");
        let Some((actor, rest)) = scoped.unwrap_or(raw).split_once('/') else {
            return Ok(None);
        };
        if scoped.is_none()
            && !actor.starts_with("did:")
            && !actor.starts_with('@')
            && !valid_handle(actor)
        {
            return Ok(None);
        }
        let owner = self.account(actor).await?;
        Ok(Some(format!("accounts/{owner}/{rest}")))
    }
}

// OCI repository components cannot contain colons. This is reversible DID
// encoding, never an account digest; storage still uses the complete DID.
pub(super) fn registry_account(did: &str) -> String {
    if let Some(id) = did.strip_prefix("did:plc:") {
        format!("did-plc-{id}")
    } else if let Some(id) = did.strip_prefix("did:web:") {
        format!("did-web-{}", hex::encode(id))
    } else {
        did.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn registry_did_encoding_is_reversible_and_hash_free() {
        let aliases = Aliases::new("https://invalid.example/resolve").unwrap();
        for did in [
            "did:plc:abcdefghijklmnopqrstuvwx",
            "did:web:example.com%3A8443:users:alice",
        ] {
            let encoded = registry_account(did);
            assert!(!encoded.contains(':'));
            assert_eq!(aliases.account(&encoded).await.unwrap(), did);
        }
    }
}
