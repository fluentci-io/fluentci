use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use async_graphql::{Context, Error, Object, ID};
use fluentci_common::common;
use fluentci_core::deps::Graph;
use fluentci_secrets::{
    aws::AwsConfig,
    azure::{AzureConfig, AzureCredential},
    google::GoogleConfig,
    vault::HashicorpVaultConfig,
    Provider,
};

use crate::schema::objects::secret_manager::SecretManager;

use super::objects::secret::Secret;

#[derive(Default, Clone)]
pub struct SecretsQuery;

#[Object]
impl SecretsQuery {
    async fn set_secret(
        &self,
        ctx: &Context<'_>,
        name: String,
        value: String,
    ) -> Result<Secret, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let secret_id = common::set_secret(graph.clone(), &name, &value)?;
        Ok(Secret {
            id: ID(secret_id),
            name,
            mount: "default".to_string(),
        })
    }

    async fn google_cloud_secret_manager(
        &self,
        ctx: &Context<'_>,
        project: String,
        google_credentials_file: String,
    ) -> Result<SecretManager, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let provider = Provider::Google(GoogleConfig {
            google_project: Some(project),
            google_credentials_file: Some(PathBuf::from(google_credentials_file)),
            google_credentials_json: None,
        });
        let id = common::add_secretmanager(graph.clone(), provider)?;
        Ok(SecretManager { id: ID(id) })
    }

    async fn aws_secrets_manager(
        &self,
        ctx: &Context<'_>,
        region: String,
        access_key_id: String,
        secret_access_key: String,
    ) -> Result<SecretManager, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let provider = Provider::Aws(AwsConfig {
            aws_region: region,
            aws_access_key_id: Some(access_key_id),
            aws_secret_access_key: Some(secret_access_key),
        });
        let id = common::add_secretmanager(graph.clone(), provider)?;
        Ok(SecretManager { id: ID(id) })
    }

    async fn azure_keyvault(
        &self,
        ctx: &Context<'_>,
        client_id: String,
        client_secret: String,
        tenant_id: String,
        keyvault_name: String,
        keyvault_url: String,
    ) -> Result<SecretManager, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let credential = AzureCredential {
            azure_client_id: Some(client_id),
            azure_client_secret: Some(client_secret),
            azure_tenant_id: Some(tenant_id),
        };
        let provider = Provider::Azure(AzureConfig {
            credential,
            azure_keyvault_name: Some(keyvault_name),
            azure_keyvault_url: Some(keyvault_url),
        });
        let id = common::add_secretmanager(graph.clone(), provider)?;
        Ok(SecretManager { id: ID(id) })
    }

    async fn hashicorp_vault(
        &self,
        ctx: &Context<'_>,
        address: String,
        token: String,
        cacerts: Option<String>,
    ) -> Result<SecretManager, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let provider = Provider::Hashicorp(HashicorpVaultConfig {
            vault_address: Some(address),
            vault_token: Some(token),
            vault_cacert: cacerts.map(|x| PathBuf::from(x)),
        });
        let id = common::add_secretmanager(graph.clone(), provider)?;
        Ok(SecretManager { id: ID(id) })
    }
}
