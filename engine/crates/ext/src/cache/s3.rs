use std::{env, fs, io::Write};

use anyhow::{Context, Error};
use async_trait::async_trait;
use aws_config::meta::region::RegionProviderChain;
use aws_sdk_s3::{primitives::ByteStream, Client};
use owo_colors::OwoColorize;

use super::CacheBackend;

pub struct S3 {
    client: Client,
    prefix: String,
}

pub async fn new() -> Result<S3, Error> {
    let region_provider = RegionProviderChain::default_provider().or_else("us-east-1");

    #[allow(deprecated)]
    let config = aws_config::from_env()
        .endpoint_url(std::env::var("FLUENTCI_CACHE_S3_ENDPOINT")?)
        .region(region_provider)
        .load()
        .await;
    let client = Client::new(&config);
    let prefix = format!("{}/{}", env::consts::OS, env::consts::ARCH);

    Ok(S3 { client, prefix })
}

#[async_trait]
impl CacheBackend for S3 {
    async fn restore(&self, path: &str) -> Result<(), Error> {
        let filename = path.split("/").last().unwrap();
        let bucket = env::var("FLUENTCI_CACHE_S3_BUCKET")?;
        let key = format!("{}/{}", self.prefix, filename);

        if let Ok(mut object) = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key.clone())
            .send()
            .await
        {
            let mut file = fs::File::create(path)?;
            while let Some(chunk) = object.body.try_next().await? {
                file.write_all(&chunk)?;
            }
            return Ok(());
        }

        println!("{} Cache not found for key: {}", "[s3]".cyan(), key);

        Ok(())
    }

    async fn save(&self, path: &str) -> Result<(), Error> {
        let body = ByteStream::read_from()
            .path(path)
            .buffer_size(1024 * 1024)
            .build()
            .await?;

        let bucket = env::var("FLUENTCI_CACHE_S3_BUCKET")?;

        let filename = path.split("/").last().unwrap();
        let key = format!("{}/{}", self.prefix, filename);

        self.client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(body)
            .send()
            .await
            .context("S3 cache upload failed")?;
        println!(" Uploaded successfully");

        Ok(())
    }
}
