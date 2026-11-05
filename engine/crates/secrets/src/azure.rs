use std::sync::Arc;

use async_trait::async_trait;
use azure_core::auth::TokenCredential;
use azure_identity::{
    ClientSecretCredential, DefaultAzureCredentialBuilder, TokenCredentialOptions,
};
use azure_security_keyvault::prelude::*;
use futures::future::try_join_all;
use futures::stream::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use super::{
    convert::{convert_env_name, decode_env_from_json},
    Vault, VaultConfig,
};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AzureConfig {
    pub credential: AzureCredential,
    pub azure_keyvault_name: Option<String>,
    pub azure_keyvault_url: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AzureCredential {
    pub azure_tenant_id: Option<String>,
    pub azure_client_id: Option<String>,
    pub azure_client_secret: Option<String>,
}

#[derive(Error, Debug)]
pub enum AzureError {
    #[error("Azure configuration error")]
    WrongConfiguration(#[source] anyhow::Error),
    #[error("cannot create Azure KeyVault client")]
    ClientError(#[source] azure_core::Error),
    #[error("cannot download secret")]
    CannotDownloadSecrets(#[source] azure_core::Error),
    #[error("cannot decode secret - it is not a valid JSON")]
    DecodeError(#[source] serde_json::Error),
}

pub struct AzureVault {
    kv_address: String,
    credential: Arc<dyn TokenCredential>,
}

pub type Result<T, E = AzureError> = std::result::Result<T, E>;

impl AzureCredential {
    fn is_valid(&self) -> bool {
        self.azure_tenant_id.is_some()
            && self.azure_client_id.is_some()
            && self.azure_client_secret.is_some()
    }

    fn validate(&self) -> Result<()> {
        let has_some = self.azure_tenant_id.is_some()
            || self.azure_client_id.is_some()
            || self.azure_client_secret.is_some();
        if has_some && !self.is_valid() {
            Err(AzureError::WrongConfiguration(anyhow::Error::msg(
                "if you want to use CLI-passed credentials, all need to be specified",
            )))
        } else {
            Ok(())
        }
    }

    fn to_credential(&self) -> Result<Arc<dyn TokenCredential>> {
        self.validate()?;
        if self.is_valid() {
            let creds = ClientSecretCredential::new(
                azure_core::new_http_client(),
                self.azure_tenant_id.clone().unwrap(),
                self.azure_client_id.clone().unwrap(),
                self.azure_client_secret.clone().unwrap(),
                TokenCredentialOptions::default(),
            );
            Ok(Arc::new(creds))
        } else {
            let creds = DefaultAzureCredentialBuilder::new()
                .exclude_environment_credential()
                .build();
            Ok(Arc::new(creds))
        }
    }
}

impl AzureConfig {
    fn get_kv_address(&self) -> Result<String> {
        if let Some(url) = &self.azure_keyvault_url {
            Ok(url.to_string())
        } else if let Some(name) = &self.azure_keyvault_name {
            Ok(format!("https://{name}.vault.azure.net"))
        } else {
            Err(AzureError::WrongConfiguration(anyhow::Error::msg(
                "configuration is invalid",
            )))
        }
    }
}

impl VaultConfig for AzureConfig {
    type Vault = AzureVault;

    fn into_vault(self) -> anyhow::Result<Self::Vault> {
        let kv_address = self.get_kv_address()?;
        let credential = self.credential.to_credential()?;
        Ok(AzureVault {
            kv_address,
            credential,
        })
    }
}

impl AzureVault {
    fn get_client(&self) -> Result<SecretClient> {
        SecretClient::new(&self.kv_address, self.credential.clone())
            .map_err(AzureError::ClientError)
    }

    fn strip_prefix(name: &str) -> &str {
        let idx = name.rfind('/').unwrap();
        &name[(idx + 1)..]
    }
}

#[async_trait]
impl Vault for AzureVault {
    async fn download_prefixed(&self, prefix: &str) -> anyhow::Result<Vec<(String, String)>> {
        let client = self.get_client()?;

        let secrets = client
            .list_secrets()
            .into_stream()
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .map_err(AzureError::CannotDownloadSecrets)?;
        let secrets: Vec<_> = secrets
            .into_iter()
            .flat_map(|x| x.value.into_iter().map(|x| x.id))
            .map(|x| AzureVault::strip_prefix(&x).to_string())
            .filter(|x| x.starts_with(prefix))
            .collect();
        let env_names = secrets
            .iter()
            .map(|x| convert_env_name(prefix, x))
            .collect::<anyhow::Result<Vec<_>>>()?;
        let env_values = secrets.iter().map(|s| {
            let client = self.get_client();
            async move {
                client?
                    .get(s)
                    .into_future()
                    .await
                    .map_err(AzureError::CannotDownloadSecrets)
            }
        });
        let env_values = try_join_all(env_values).await?.into_iter().map(|x| x.value);
        let from_kv = env_names.into_iter().zip(env_values.into_iter()).collect();
        Ok(from_kv)
    }

    async fn download_json(&self, secret_name: &str) -> anyhow::Result<Vec<(String, String)>> {
        let client = self.get_client()?;
        let secret = client
            .get(secret_name)
            .into_future()
            .await
            .map_err(AzureError::CannotDownloadSecrets)?;
        let value: Value = serde_json::from_str(&secret.value).map_err(AzureError::DecodeError)?;
        decode_env_from_json(secret_name, value)
    }
}
