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

fn account(did: &str) -> String {
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

    pub(super) async fn canonical(&self, raw: &str) -> Result<Option<String>> {
        let Some((actor, rest)) = raw.split_once('/') else {
            return Ok(None);
        };
        let owner = if actor.starts_with("did:") {
            if !valid_did(actor) {
                return Err(Failure(StatusCode::BAD_REQUEST, "invalid account DID\n"));
            }
            actor.to_owned()
        } else if let Some(handle) = actor.strip_prefix('@') {
            let handle = handle.to_ascii_lowercase();
            if !valid_handle(&handle) {
                return Err(Failure(StatusCode::BAD_REQUEST, "invalid account handle\n"));
            }
            let _lookup = tokio::time::timeout(Duration::from_secs(10), self.lookup.lock())
                .await
                .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "identity lookup timed out\n"))?;
            let cached = self.handles.lock().await.get(&handle).cloned();
            if let Some((owner, _)) = cached.filter(|(_, expires)| *expires > Instant::now()) {
                return Ok(Some(format!("accounts/{}/{rest}", account(&owner))));
            }
            let unavailable =
                || Failure(StatusCode::BAD_GATEWAY, "identity resolver unavailable\n");
            let mut url = self.endpoint.clone();
            url.query_pairs_mut().append_pair("actor", &handle);
            let response = self
                .client
                .get(url)
                .send()
                .await
                .map_err(|_| unavailable())?;
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                return Err(Failure(StatusCode::NOT_FOUND, "account handle not found\n"));
            }
            if !response.status().is_success() {
                return Err(unavailable());
            }
            let data = response.bytes().await.map_err(|_| unavailable())?;
            if data.len() > 8192 {
                return Err(unavailable());
            }
            let identity: Identity = serde_json::from_slice(&data).map_err(|_| unavailable())?;
            if !valid_did(&identity.owner) || account(&identity.owner) != identity.cache_id {
                return Err(unavailable());
            }
            let mut handles = self.handles.lock().await;
            handles.retain(|_, (_, expires)| *expires > Instant::now());
            if handles.len() >= 1024 {
                handles.clear();
            }
            handles.insert(
                handle,
                (
                    identity.owner.clone(),
                    Instant::now() + Duration::from_secs(60),
                ),
            );
            identity.owner
        } else {
            return Ok(None);
        };
        Ok(Some(format!("accounts/{}/{rest}", account(&owner))))
    }
}
