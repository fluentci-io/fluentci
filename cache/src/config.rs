use anyhow::{Result, bail};
use clap::{ArgMatches, Args, ValueEnum, parser::ValueSource};
use object_store::{
    ObjectStore, aws::AmazonS3Builder, local::LocalFileSystem, memory::InMemory,
    prefix::PrefixStore,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, path::PathBuf, sync::Arc};

#[derive(Clone, Copy, Debug, ValueEnum, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    S3,
    File,
    Memory,
}

/// Server configuration. Credentials are read through object_store's AWS provider chain.
#[derive(Clone, Debug, Args, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Optional TOML file. Environment variables and explicit flags override it.
    #[arg(long = "config", env = "FLUENTCI_CACHE_CONFIG")]
    #[serde(skip)]
    pub config_file: Option<PathBuf>,
    #[arg(long, env = "FLUENTCI_CACHE_BIND", default_value = "127.0.0.1:8080")]
    pub bind: SocketAddr,
    #[arg(long, env = "FLUENTCI_CACHE_BACKEND", value_enum, default_value = "s3")]
    pub backend: Backend,
    #[arg(long, env = "FLUENTCI_CACHE_BUCKET")]
    pub bucket: Option<String>,
    #[arg(long, env = "FLUENTCI_CACHE_ENDPOINT")]
    pub endpoint: Option<String>,
    #[arg(long, env = "FLUENTCI_CACHE_REGION", default_value = "us-east-1")]
    pub region: String,
    #[arg(long, env = "FLUENTCI_CACHE_ALLOW_HTTP", default_value_t = false, action = clap::ArgAction::Set, num_args = 0..=1, default_missing_value = "true")]
    pub allow_http: bool,
    #[arg(
        long,
        env = "FLUENTCI_CACHE_PREFIX",
        default_value = "fluentci-cache/v1"
    )]
    pub prefix: String,
    #[arg(long, env = "FLUENTCI_CACHE_DIRECTORY", default_value = "./cache-data")]
    pub directory: PathBuf,
    /// Bearer token, or password with any Basic-auth username. Never logged.
    #[arg(long, env = "FLUENTCI_CACHE_TOKEN", hide_env_values = true)]
    pub token: Option<String>,
    #[arg(long, env = "FLUENTCI_CACHE_PUBLIC_READ", default_value_t = true, action = clap::ArgAction::Set)]
    pub public_read: bool,
    #[arg(long, env = "FLUENTCI_CACHE_READ_ONLY", default_value_t = false, action = clap::ArgAction::Set, num_args = 0..=1, default_missing_value = "true")]
    pub read_only: bool,
    #[arg(long, env = "FLUENTCI_CACHE_MAX_UPLOAD", default_value_t = 10 * 1024 * 1024 * 1024_u64)]
    pub max_upload: u64,
    #[arg(long, env = "FLUENTCI_CACHE_CONCURRENCY", default_value_t = 128)]
    pub concurrency: usize,
    /// Entire upload deadline and per-chunk download idle timeout.
    #[arg(long, env = "FLUENTCI_CACHE_TIMEOUT", default_value_t = 300)]
    pub timeout: u64,
    #[arg(long, env = "FLUENTCI_CACHE_NIX_PRIORITY", default_value_t = 40)]
    pub nix_priority: u32,
}

impl Config {
    /// Merge a partial TOML file with CLI defaults, then apply explicit env/CLI values.
    pub fn resolve(self, matches: &ArgMatches) -> Result<Self> {
        let Some(path) = &self.config_file else {
            self.validate()?;
            return Ok(self);
        };
        let table: toml::Table = toml::from_str(&std::fs::read_to_string(path)?)?;
        let mut merged = serde_json::to_value(&self)?;
        let cli = merged.clone();
        let target = merged.as_object_mut().expect("configuration object");
        for (key, value) in table {
            if !target.contains_key(&key) {
                bail!("unknown cache configuration key: {key}");
            }
            target.insert(key, serde_json::to_value(value)?);
        }
        for key in target.keys().cloned().collect::<Vec<_>>() {
            if matches!(
                matches.value_source(&key),
                Some(ValueSource::CommandLine | ValueSource::EnvVariable)
            ) {
                target.insert(key.clone(), cli[&key].clone());
            }
        }
        let resolved: Self = serde_json::from_value(merged)?;
        resolved.validate()?;
        Ok(resolved)
    }

    pub fn validate(&self) -> Result<()> {
        if self.concurrency == 0 || self.timeout == 0 || self.max_upload == 0 {
            bail!("concurrency, timeout, and max-upload must be positive");
        }
        if self
            .token
            .as_ref()
            .is_some_and(|s| s.is_empty() || s.contains(['\r', '\n']))
        {
            bail!("token must be nonempty and contain no line breaks");
        }
        if !self.read_only && self.token.is_none() {
            bail!(
                "a token is required for a writable cache; set FLUENTCI_CACHE_TOKEN or use --read-only"
            );
        }
        if !self.public_read && self.token.is_none() {
            bail!("a token is required for private reads");
        }
        Ok(())
    }

    pub fn storage(&self) -> Result<Arc<dyn ObjectStore>> {
        self.validate()?;
        let store: Arc<dyn ObjectStore> = match self.backend {
            Backend::S3 => {
                let mut builder = AmazonS3Builder::from_env()
                    .with_bucket_name(
                        self.bucket
                            .as_deref()
                            .ok_or_else(|| anyhow::anyhow!("--bucket is required for S3"))?,
                    )
                    .with_region(&self.region)
                    .with_allow_http(self.allow_http)
                    .with_virtual_hosted_style_request(false);
                if let Some(endpoint) = &self.endpoint {
                    builder = builder.with_endpoint(endpoint);
                }
                Arc::new(builder.build()?)
            }
            Backend::File => {
                std::fs::create_dir_all(&self.directory)?;
                Arc::new(LocalFileSystem::new_with_prefix(&self.directory)?)
            }
            Backend::Memory => Arc::new(InMemory::new()),
        };
        let prefix = object_store::path::Path::parse(&self.prefix)?;
        Ok(Arc::new(PrefixStore::new(store, prefix)))
    }
}
