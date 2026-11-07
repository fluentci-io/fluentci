use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub enum Provider {
    Google(GoogleConfig),
    Aws(AwsConfig),
    Azure(AzureConfig),
    Hashicorp(HashicorpVaultConfig),
}

#[derive(Serialize, Deserialize)]
pub struct Secret {
    pub id: String,
    pub name: String,
    pub mount: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct AwsConfig {
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_region: String,
}

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

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct GoogleConfig {
    pub google_credentials_file: Option<PathBuf>,
    pub google_credentials_json: Option<String>,
    pub google_project: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct HashicorpVaultConfig {
    pub vault_address: Option<String>,
    pub vault_token: Option<String>,
    pub vault_cacert: Option<PathBuf>,
}
