use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as base64, Engine as _};
use google_secretmanager1::{
    hyper, hyper::client::HttpConnector, hyper_rustls, hyper_rustls::HttpsConnector, oauth2,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use thiserror::Error;

use super::{convert::decode_env_from_json, Vault, VaultConfig};

type SecretManager = google_secretmanager1::SecretManager<HttpsConnector<HttpConnector>>;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct GoogleConfig {
    pub google_credentials_file: Option<PathBuf>,
    pub google_credentials_json: Option<String>,
    pub google_project: Option<String>,
}

#[derive(Error, Debug)]
pub enum GoogleError {
    #[error("Google SA configuration is invalid")]
    ConfigurationError(#[source] std::io::Error),
    #[error("secret manager operation failed")]
    SecretManagerError(#[source] google_secretmanager1::Error),
    #[error("the secret is empty")]
    EmptySecret,
    #[error("there are no secrets in the project")]
    NoSecrets,
    #[error("secret encoding is invalid")]
    WrongEncoding(#[source] anyhow::Error),
    #[error("cannot decode secret - it is not a valid JSON")]
    DecodeError(#[source] serde_json::Error),
}

pub type Result<T, E = GoogleError> = std::result::Result<T, E>;

impl VaultConfig for GoogleConfig {
    type Vault = GoogleConfig;

    fn into_vault(self) -> anyhow::Result<Self::Vault> {
        Ok(self)
    }
}

impl GoogleConfig {
    async fn to_manager(&self) -> Result<SecretManager> {
        let auth = self
            .to_authenticator()
            .await
            .map_err(GoogleError::ConfigurationError)?;
        let manager = SecretManager::new(
            hyper::Client::builder().build(
                hyper_rustls::HttpsConnectorBuilder::new()
                    .with_native_roots()
                    .https_or_http()
                    .enable_http1()
                    .enable_http2()
                    .build(),
            ),
            auth,
        );
        Ok(manager)
    }

    async fn to_authenticator(
        &self,
    ) -> std::io::Result<oauth2::authenticator::Authenticator<HttpsConnector<HttpConnector>>> {
        if let Some(path) = &self.google_credentials_file {
            let key = oauth2::read_service_account_key(path).await?;
            let auth = oauth2::ServiceAccountAuthenticator::builder(key)
                .build()
                .await?;
            Ok(auth)
        } else if let Some(json) = &self.google_credentials_json {
            let key = oauth2::parse_service_account_key(json)?;
            let auth = oauth2::ServiceAccountAuthenticator::builder(key)
                .build()
                .await?;
            Ok(auth)
        } else {
            let opts = oauth2::ApplicationDefaultCredentialsFlowOpts::default();
            let auth = match oauth2::ApplicationDefaultCredentialsAuthenticator::builder(opts).await
            {
                oauth2::authenticator::ApplicationDefaultCredentialsTypes::ServiceAccount(auth) => {
                    auth.build().await?
                }
                oauth2::authenticator::ApplicationDefaultCredentialsTypes::InstanceMetadata(
                    auth,
                ) => auth.build().await?,
            };
            Ok(auth)
        }
    }
}

#[async_trait]
impl Vault for GoogleConfig {
    async fn download_prefixed(&self, prefix: &str) -> anyhow::Result<Vec<(String, String)>> {
        let mut manager = self.to_manager().await?;
        let project = self.google_project.as_ref().unwrap();
        let response = manager
            .projects()
            .secrets_list(&format!("projects/{project}"))
            .page_size(250)
            .doit()
            .await
            .map_err(GoogleError::SecretManagerError)?;
        let secrets: Vec<_> = response
            .1
            .secrets
            .ok_or(GoogleError::NoSecrets)?
            .into_iter()
            .filter(|f| f.name.is_some())
            .filter(|f| self.secret_matches(prefix, f.name.as_ref().unwrap()))
            .collect();
        let mut from_kv = Vec::with_capacity(secrets.len());
        for secret in secrets {
            let value = self
                .get_secret_full_name(&mut manager, secret.name.as_ref().unwrap())
                .await?;
            let name = self
                .strip_prefix(prefix, secret.name.as_ref().unwrap())
                .to_string();
            from_kv.push((name, value));
        }
        Ok(from_kv)
    }

    async fn download_json(&self, secret_name: &str) -> anyhow::Result<Vec<(String, String)>> {
        let mut manager = self.to_manager().await?;
        let secret = self.get_secret(&mut manager, secret_name).await?;
        let value: Value = serde_json::from_str(&secret).map_err(GoogleError::DecodeError)?;
        decode_env_from_json(secret_name, value)
    }
}

impl GoogleConfig {
    fn strip_project<'a>(&'_ self, name: &'a str) -> &'a str {
        let idx = name.rfind('/').unwrap();
        &name[(idx + 1)..]
    }

    fn secret_matches(&self, prefix: &str, name: &str) -> bool {
        self.strip_project(name).starts_with(prefix)
    }

    fn strip_prefix<'a>(&'_ self, prefix: &'_ str, name: &'a str) -> &'a str {
        &self.strip_project(name)[prefix.len()..]
    }

    async fn get_secret(&self, client: &mut SecretManager, secret_name: &str) -> Result<String> {
        self.get_secret_full_name(
            client,
            &format!(
                "projects/{}/secrets/{}",
                self.google_project.as_ref().unwrap(),
                secret_name
            ),
        )
        .await
    }

    async fn get_secret_full_name(
        &self,
        manager: &mut SecretManager,
        name: &str,
    ) -> Result<String> {
        let data = manager
            .projects()
            .secrets_versions_access(&format!("{name}/versions/latest"))
            .doit()
            .await
            .map_err(GoogleError::SecretManagerError)?
            .1
            .payload
            .ok_or(GoogleError::EmptySecret)?
            .data
            .ok_or(GoogleError::EmptySecret)?;
        let raw_bytes = base64
            .decode(data)
            .map_err(|e| GoogleError::WrongEncoding(anyhow::anyhow!(e)))?;
        String::from_utf8(raw_bytes).map_err(|e| GoogleError::WrongEncoding(anyhow::anyhow!(e)))
    }
}
