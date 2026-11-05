use std::str::FromStr;

use async_trait::async_trait;
use futures::future::try_join_all;
use rusoto_core::{request::TlsError, HttpClient, Region};
use rusoto_credential::{CredentialsError, DefaultCredentialsProvider, StaticProvider};
use rusoto_secretsmanager::{
    GetSecretValueError, GetSecretValueRequest, GetSecretValueResponse, ListSecretsError,
    ListSecretsRequest, SecretsManager, SecretsManagerClient,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::{
    convert::{convert_env_name, decode_env_from_json},
    Vault, VaultConfig,
};

#[derive(Serialize, Deserialize)]
pub struct AwsConfig {
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_region: String,
}

#[derive(Error, Debug)]
pub enum AwsError {
    #[error("rusoto HttpClient error")]
    TlsError(#[source] TlsError),
    #[error("rusoto HttpClient error")]
    CredentialsError(#[source] CredentialsError),
    #[error("cannot load secret from Secrets Manager")]
    GetSecretError(#[source] rusoto_core::RusotoError<GetSecretValueError>),
    #[error("the secret does not have string data")]
    NoStringData(String),
    #[error("the secret name is not valid environment variable name")]
    InvalidSecretName(String),
    #[error("cannot list secrets from Secrets Manager")]
    ListSecretsError(#[source] rusoto_core::RusotoError<ListSecretsError>),
    #[error("cannot decode secret - it is not a valid JSON object")]
    DecodeError(#[source] serde_json::Error),
    #[error("there are no secrets in the Secrets Manager")]
    NoSecrets,
}

pub type Result<T, E = AwsError> = std::result::Result<T, E>;

pub struct AwsVault {
    client: SecretsManagerClient,
}

impl VaultConfig for AwsConfig {
    type Vault = AwsVault;

    fn into_vault(self) -> anyhow::Result<Self::Vault> {
        let http_client = HttpClient::new().map_err(AwsError::TlsError)?;
        if let Some(key_id) = self.aws_access_key_id {
            let secret = self.aws_secret_access_key.unwrap();
            let provider = StaticProvider::new_minimal(key_id, secret);
            Ok(Self::Vault {
                client: SecretsManagerClient::new_with(
                    http_client,
                    provider,
                    Region::from_str(&self.aws_region)?,
                ),
            })
        } else {
            let provider = DefaultCredentialsProvider::new().map_err(AwsError::CredentialsError)?;
            Ok(Self::Vault {
                client: SecretsManagerClient::new_with(
                    http_client,
                    provider,
                    Region::from_str(&self.aws_region)?,
                ),
            })
        }
    }
}

#[async_trait]
impl Vault for AwsVault {
    async fn download_prefixed(&self, prefix: &str) -> anyhow::Result<Vec<(String, String)>> {
        let list = self
            .client
            .list_secrets(ListSecretsRequest {
                max_results: Some(100),
                ..Default::default()
            })
            .await
            .map_err(AwsError::ListSecretsError)?;
        let results = list
            .secret_list
            .ok_or(AwsError::NoSecrets)?
            .into_iter()
            .filter(|x| {
                x.name
                    .as_ref()
                    .map(|n| n.starts_with(prefix))
                    .unwrap_or(false)
            })
            .map(|s| async {
                println!("{:?}", s);
                let name = s.name.unwrap();
                let secret = self
                    .client
                    .get_secret_value(GetSecretValueRequest {
                        secret_id: name.clone(),
                        version_id: None,
                        version_stage: None,
                    })
                    .await
                    .map_err(AwsError::GetSecretError)?;
                println!("{:?}", secret);
                let value = secret
                    .secret_string
                    .ok_or_else(|| AwsError::NoStringData(name.clone()))?;
                let name = convert_env_name(prefix, &name)
                    .map_err(|_| AwsError::InvalidSecretName(name.clone()))?;
                Ok::<_, AwsError>((name, value))
            });
        let values: Vec<_> = try_join_all(results).await?.into_iter().collect();
        Ok(values)
    }

    async fn download_json(&self, secret_name: &str) -> anyhow::Result<Vec<(String, String)>> {
        let secret = self
            .client
            .get_secret_value(GetSecretValueRequest {
                secret_id: secret_name.to_string(),
                version_id: None,
                version_stage: None,
            })
            .await
            .map_err(AwsError::GetSecretError)?;
        let value = decode_secret(secret)?;
        decode_env_from_json(secret_name, value)
    }
}

fn decode_secret(secret: GetSecretValueResponse) -> Result<Value> {
    secret
        .secret_string
        .as_ref()
        .map(|x| serde_json::from_str(&x[..]))
        .or_else(|| secret.secret_binary.map(|b| serde_json::from_slice(&b)))
        .unwrap()
        .map_err(AwsError::DecodeError)
}
