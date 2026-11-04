use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod aws;
pub mod azure;
pub mod convert;
pub mod google;
pub mod vault;

#[derive(Serialize, Deserialize)]
pub enum Provider {
    Google(google::GoogleConfig),
    Aws(aws::AwsConfig),
    Azure(azure::AzureConfig),
    Hashicorp(vault::HashicorpVaultConfig),
}

#[async_trait]
pub trait Vault {
    async fn download_prefixed(&self, prefix: &str) -> Result<Vec<(String, String)>>;
    async fn download_json(&self, secret_name: &str) -> Result<Vec<(String, String)>>;
}

pub trait VaultConfig {
    type Vault: Vault;
    fn into_vault(self) -> Result<Self::Vault>;
}

pub fn download_env() {}
