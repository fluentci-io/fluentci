use super::{Backend, Node, ServeArgs, TTL, client, origin};
use anyhow::{Context, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::{Method, StatusCode};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Clone)]
pub(super) struct Store {
    backend: Backend,
    endpoint: String,
    prefix: String,
    token: Option<String>,
    client: reqwest::Client,
}

impl Store {
    fn collection(&self, collection: &str) -> String {
        format!(
            "{}{collection}/",
            self.prefix
                .strip_suffix("nodes/")
                .expect("Membership prefix")
        )
    }

    pub async fn records<T: serde::de::DeserializeOwned>(
        &self,
        collection: &str,
    ) -> Result<Vec<(T, u64)>> {
        let prefix = self.collection(collection);
        let mut records = Vec::new();
        match self.backend {
            Backend::Etcd => {
                let mut end = prefix.as_bytes().to_vec();
                *end.last_mut().expect("Nonempty prefix") += 1;
                let value = self
                    .etcd(
                        "/v3/kv/range",
                        json!({"key": STANDARD.encode(prefix), "range_end": STANDARD.encode(end)}),
                    )
                    .await?;
                if let Some(entries) = value.get("kvs") {
                    for entry in entries.as_array().context("Invalid etcd records")? {
                        let version = entry["mod_revision"]
                            .as_str()
                            .context("Missing etcd revision")?
                            .parse()?;
                        records.push((
                            serde_json::from_slice(
                                &STANDARD
                                    .decode(entry["value"].as_str().context("Missing value")?)?,
                            )?,
                            version,
                        ));
                    }
                }
            }
            Backend::Consul => {
                let response = self
                    .request(
                        Method::GET,
                        &format!("/v1/kv/{prefix}?recurse=true&consistent=true"),
                    )
                    .send()
                    .await?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(records);
                }
                let entries: Vec<Value> = response.error_for_status()?.json().await?;
                for entry in entries {
                    let version = entry["ModifyIndex"]
                        .as_u64()
                        .context("Missing Consul revision")?;
                    records.push((
                        serde_json::from_slice(
                            &STANDARD.decode(entry["Value"].as_str().context("Missing value")?)?,
                        )?,
                        version,
                    ));
                }
            }
        }
        Ok(records)
    }

    /// Atomic compare-and-set. Jobs are durable and never attached to membership leases.
    pub async fn cas<T: serde::Serialize>(
        &self,
        collection: &str,
        id: Uuid,
        version: u64,
        value: &T,
    ) -> Result<bool> {
        let key = format!("{}{id}", self.collection(collection));
        let value = serde_json::to_vec(value)?;
        match self.backend {
            Backend::Etcd => {
                let key = STANDARD.encode(key);
                let response = self.etcd("/v3/kv/txn", json!({
                    "compare": [{"key": key, "target": "MOD", "result": "EQUAL", "mod_revision": version.to_string()}],
                    "success": [{"request_put": {"key": key, "value": STANDARD.encode(value)}}], "failure": []
                })).await?;
                Ok(response["succeeded"].as_bool().unwrap_or(false))
            }
            Backend::Consul => Ok(self
                .request(Method::PUT, &format!("/v1/kv/{key}?cas={version}"))
                .body(value)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?),
        }
    }

    pub fn new(args: &ServeArgs) -> Result<Self> {
        ensure!(
            !args.name.is_empty()
                && args.name.len() <= 64
                && args
                    .name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "Cluster name must contain 1–64 letters, digits, underscores, or hyphens"
        );
        Ok(Self {
            backend: args.state,
            endpoint: origin(&args.state_url)?,
            prefix: format!("fluentci/clusters/{}/nodes/", args.name),
            token: args.state_token.clone(),
            client: client(5)?,
        })
    }

    fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let request = self
            .client
            .request(method, format!("{}{path}", self.endpoint));
        match (&self.backend, &self.token) {
            (Backend::Consul, Some(token)) => request.header("X-Consul-Token", token),
            (Backend::Etcd, Some(token)) => request.header("Authorization", token),
            (_, None) => request,
        }
    }

    async fn etcd(&self, path: &str, payload: Value) -> Result<Value> {
        let response: Value = self
            .request(Method::POST, path)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        ensure!(
            response.get("error").is_none() && response.get("code").is_none(),
            "etcd rejected state operation"
        );
        Ok(response)
    }

    pub async fn put(&self, node: &Node) -> Result<()> {
        let key = format!("{}{}", self.prefix, node.id);
        match self.backend {
            Backend::Etcd => {
                // Replacing a short lease makes refresh independent of which API
                // replica receives the heartbeat. Old, unattached leases expire.
                let lease = self
                    .etcd("/v3/lease/grant", json!({"TTL": TTL.to_string()}))
                    .await?;
                let id = lease.get("ID").context("etcd did not return a lease ID")?;
                ensure!(
                    id.as_str().is_some_and(|id| id != "0")
                        || id.as_i64().is_some_and(|id| id != 0),
                    "Invalid etcd lease ID"
                );
                self.etcd(
                    "/v3/kv/put",
                    json!({
                        "key": STANDARD.encode(key),
                        "value": STANDARD.encode(serde_json::to_vec(node)?),
                        "lease": id,
                    }),
                )
                .await?;
            }
            Backend::Consul => {
                // Sessions belong to this membership key, never to an API
                // replica. No local lease map or elected API leader is needed.
                // Renew by replacing the session after removing its old lock.
                // A transaction prevents another registration seeing a gap.
                let session: Value = self.request(Method::PUT, "/v1/session/create")
                    .json(&json!({"Name": format!("fluentci-{}", node.id), "TTL": format!("{TTL}s"), "Behavior": "delete", "LockDelay": "0s", "Checks": []}))
                    .send().await?.error_for_status()?.json().await?;
                let session = session["ID"]
                    .as_str()
                    .context("Consul did not return a session ID")?;
                let session = Uuid::parse_str(session).context("Invalid Consul session ID")?;
                // Delete detaches the old session; lock attaches the new one
                // atomically, so expiration of the old session cannot delete it.
                let response = self.request(Method::PUT, "/v1/txn").json(&json!([
                    {"KV": {"Verb": "delete", "Key": key }},
                    {"KV": {"Verb": "lock", "Key": key, "Session": session.to_string(), "Value": STANDARD.encode(serde_json::to_vec(node)?) }}
                ])).send().await?.error_for_status()?;
                let response: Value = response.json().await?;
                ensure!(
                    response.get("Errors").is_none_or(Value::is_null),
                    "Consul rejected membership transaction"
                );
            }
        }
        Ok(())
    }

    pub async fn nodes(&self) -> Result<Vec<Node>> {
        let encoded: Vec<String> = match self.backend {
            Backend::Etcd => {
                let mut end = self.prefix.as_bytes().to_vec();
                *end.last_mut().expect("Nonempty prefix") += 1;
                let response = self.etcd("/v3/kv/range", json!({"key": STANDARD.encode(&self.prefix), "range_end": STANDARD.encode(end)})).await?;
                match response.get("kvs") {
                    None => Vec::new(),
                    Some(values) => values
                        .as_array()
                        .context("Invalid etcd range response")?
                        .iter()
                        .map(|entry| {
                            entry["value"]
                                .as_str()
                                .map(str::to_owned)
                                .context("Invalid etcd membership value")
                        })
                        .collect::<Result<_>>()?,
                }
            }
            Backend::Consul => {
                let response = self
                    .request(
                        Method::GET,
                        &format!("/v1/kv/{}?recurse=true&consistent=true", self.prefix),
                    )
                    .send()
                    .await?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(Vec::new());
                }
                let entries: Vec<Value> = response.error_for_status()?.json().await?;
                entries
                    .iter()
                    .filter(|entry| entry["Session"].as_str().is_some_and(|v| !v.is_empty()))
                    .map(|entry| {
                        entry["Value"]
                            .as_str()
                            .map(str::to_owned)
                            .context("Invalid Consul membership value")
                    })
                    .collect::<Result<_>>()?
            }
        };
        let mut nodes = Vec::new();
        for value in encoded {
            let node: Node = serde_json::from_slice(&STANDARD.decode(value)?)?;
            if node.expires_at > chrono::Utc::now().timestamp() {
                nodes.push(node);
            }
        }
        nodes.sort_by_key(|node| node.id);
        Ok(nodes)
    }

    pub async fn remove(&self, id: Uuid) -> Result<()> {
        let key = format!("{}{id}", self.prefix);
        match self.backend {
            Backend::Etcd => {
                self.etcd("/v3/kv/deleterange", json!({"key": STANDARD.encode(key)}))
                    .await?;
            }
            Backend::Consul => {
                self.request(Method::DELETE, &format!("/v1/kv/{key}"))
                    .send()
                    .await?
                    .error_for_status()?;
            }
        }
        Ok(())
    }
}
