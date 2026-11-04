use std::{collections::HashMap, path::PathBuf};

use async_trait::async_trait;
use futures::future::try_join_all;
use reqwest::{self, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::io::AsyncReadExt;

use super::{convert::as_valid_env_name, Vault, VaultConfig};

#[derive(Serialize, Deserialize)]
pub struct HashicorpVaultConfig {
    pub vault_address: Option<String>,
    pub vault_token: Option<String>,
    pub vault_cacert: Option<PathBuf>,
}

#[derive(Error, Debug)]
pub enum HashicorpVaultError {
    #[error("secret '{0}' does not exist")]
    SecretNotFound(String),

    #[error("the vault token is invalid")]
    UnauthorizedError,

    #[error("the token does not have access to secret '{0}'")]
    ForbiddenError(String),

    #[error("HTTP error occurred")]
    HttpError(#[source] reqwest::Error),

    #[error("the Vault returned non-200 error code")]
    HttpStatusCodeError(StatusCode),

    #[error("cannot deserialize the response")]
    DeserializeError(#[source] reqwest::Error),

    #[error("the keys in the secret are not valid env names")]
    InvalidEnv(#[source] anyhow::Error),

    #[error("the configuration is invalid")]
    ConfigurationError(#[from] anyhow::Error),
}

pub struct HashicorpVault {
    address: String,
    token: String,
    cacert: Option<PathBuf>,
}

impl VaultConfig for HashicorpVaultConfig {
    type Vault = HashicorpVault;

    fn into_vault(self) -> anyhow::Result<Self::Vault> {
        Ok(Self::Vault {
            address: self.vault_address.unwrap(),
            token: self.vault_token.unwrap(),
            cacert: self.vault_cacert,
        })
    }
}

impl HashicorpVault {
    async fn client(&self) -> Result<reqwest::Client, HashicorpVaultError> {
        let mut builder = reqwest::Client::builder().user_agent("fluentci-engine");

        if let Some(path) = self.cacert.as_ref() {
            let mut buffer = Vec::new();
            {
                let mut file = tokio::fs::File::open(path)
                    .await
                    .map_err(anyhow::Error::new)?;
                file.read_to_end(&mut buffer)
                    .await
                    .map_err(anyhow::Error::new)?;
            }
            let cert = reqwest::Certificate::from_pem(&buffer).map_err(anyhow::Error::new)?;
            builder = builder.add_root_certificate(cert);
        }

        builder
            .build()
            .map_err(anyhow::Error::new)
            .map_err(HashicorpVaultError::ConfigurationError)
    }

    fn parse_secrets(secret: SecretResponse) -> Result<Vec<(String, String)>, HashicorpVaultError> {
        secret
            .data
            .data
            .into_iter()
            .map(|(k, v)| as_valid_env_name(k).map(|k| (k, v)))
            .collect::<anyhow::Result<Vec<_>>>()
            .map_err(HashicorpVaultError::InvalidEnv)
    }

    async fn get_single_key(
        &self,
        client: &reqwest::Client,
        secret_name: impl AsRef<str>,
    ) -> Result<Vec<(String, String)>, HashicorpVaultError> {
        let response = client
            .get(format!(
                "{}/v1/secret/data/{}",
                self.address,
                secret_name.as_ref()
            ))
            .header("X-Vault-Token", &self.token)
            .send()
            .await
            .map_err(HashicorpVaultError::HttpError)?;
        handle_common_errors(secret_name.as_ref(), &response)?;

        let data: SecretResponse = response
            .json()
            .await
            .map_err(HashicorpVaultError::DeserializeError)?;
        Self::parse_secrets(data)
    }
}

#[async_trait]
impl Vault for HashicorpVault {
    async fn download_prefixed(&self, prefix: &str) -> anyhow::Result<Vec<(String, String)>> {
        let client = self.client().await?;

        let response = client
            .get(format!("{}/v1/secret/metadata?list=true", self.address))
            .header("X-Vault-Token", &self.token)
            .send()
            .await
            .map_err(HashicorpVaultError::HttpError)?;
        handle_common_errors(prefix, &response)?;

        let list: ListResponse = response
            .json()
            .await
            .map_err(HashicorpVaultError::DeserializeError)?;

        let env_values = list
            .data
            .keys
            .into_iter()
            .filter(|p| p.starts_with(prefix))
            .map(|s| self.get_single_key(&client, s));
        let env_values: Vec<_> = try_join_all(env_values)
            .await?
            .into_iter()
            .flatten()
            .collect();
        Ok(env_values)
    }

    async fn download_json(&self, secret_name: &str) -> anyhow::Result<Vec<(String, String)>> {
        let client = self.client().await?;
        let result = self.get_single_key(&client, secret_name).await?;
        Ok(result)
    }
}

fn handle_common_errors(
    secret_name: &str,
    response: &reqwest::Response,
) -> Result<(), HashicorpVaultError> {
    match response.status() {
        StatusCode::NOT_FOUND => Err(HashicorpVaultError::SecretNotFound(secret_name.to_string())),
        StatusCode::UNAUTHORIZED => Err(HashicorpVaultError::UnauthorizedError),
        StatusCode::FORBIDDEN => Err(HashicorpVaultError::ForbiddenError(secret_name.to_string())),
        StatusCode::OK => Ok(()),
        other => Err(HashicorpVaultError::HttpStatusCodeError(other)),
    }
}

#[derive(Deserialize, Debug)]
struct SecretResponse {
    pub data: Secret,
}

#[derive(Deserialize, Debug)]
struct Secret {
    pub data: HashMap<String, String>,
}

#[derive(Deserialize, Debug)]
struct ListResponse {
    pub data: KeyList,
}

#[derive(Deserialize, Debug)]
struct KeyList {
    pub keys: Vec<String>,
}
