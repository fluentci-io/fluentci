use std::{env, fs};

use anyhow::Error;
use async_trait::async_trait;
use cloud_storage::Client;
use mime_guess::MimeGuess;
use owo_colors::OwoColorize;

use super::CacheBackend;

pub struct GoogleCloudStorage {
    client: Client,
    prefix: String,
}

pub async fn new() -> Result<GoogleCloudStorage, Error> {
    let client = Client::default();
    let prefix = format!("{}/{}", env::consts::OS, env::consts::ARCH);
    Ok(GoogleCloudStorage { client, prefix })
}

#[async_trait]
impl CacheBackend for GoogleCloudStorage {
    async fn restore(&self, path: &str) -> Result<(), Error> {
        let filename = path.split("/").last().unwrap();
        let object = format!("{}/{}", self.prefix, filename);
        let bucket = env::var("FLUENTCI_CACHE_GCS_BUCKET")?;
        match self.client.object().download(&bucket, &object).await {
            Ok(data) => {
                fs::write(path, data)?;
            }
            Err(_) => println!("{} Cache not found for key: {}", "[gcs]".cyan(), object),
        };

        Ok(())
    }

    async fn save(&self, path: &str) -> Result<(), Error> {
        let name = path.split("/").last().unwrap();
        let name = format!("{}/{}", self.prefix, name);

        let data = fs::read(path)?;
        let bucket = env::var("FLUENTCI_CACHE_GCS_BUCKET")?;
        let mime_type = MimeGuess::from_path(path).first_or_octet_stream();

        self.client
            .object()
            .create(&bucket, data, &name, &mime_type.to_string())
            .await?;

        Ok(())
    }
}
