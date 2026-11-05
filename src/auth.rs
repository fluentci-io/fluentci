use crate::{db::Db, registry};
use anyhow::{Context, Result};

pub async fn token(db: &Db) -> Result<String> {
    if let Ok(token) = std::env::var("FLUENTCI_ACCESS_TOKEN") {
        return Ok(token);
    }
    if let Some(token) = db.setting("access_token").await? {
        return Ok(token);
    }

    // Import the previous CLI's token once; subsequent writes use SQLite.
    if let Some(home) = dirs::home_dir()
        && let Ok(token) = tokio::fs::read_to_string(home.join(".fluentci/access-token")).await
    {
        db.set_setting("access_token", token.trim()).await?;
        return Ok(token.trim().into());
    }
    anyhow::bail!("You are not logged in. Run fluentci login or set FLUENTCI_ACCESS_TOKEN")
}

pub async fn user_id(token: &str) -> Result<String> {
    Ok(registry::client()
        .get("https://api.fluentci.io/validate")
        .query(&[("token", token)])
        .send()
        .await?
        .error_for_status()
        .context("Invalid access token")?
        .text()
        .await?)
}

pub async fn login(db: &Db) -> Result<()> {
    println!("Generate an access token at https://app.fluentci.io/settings/tokens");
    let token =
        tokio::task::spawn_blocking(|| rpassword::prompt_password("Enter your access token: "))
            .await??;
    user_id(&token).await?;
    db.set_setting("access_token", &token).await?;
    println!("Logged in successfully");
    Ok(())
}

pub async fn whoami(db: &Db) -> Result<()> {
    let id = user_id(&token(db).await?).await?;
    let mut request = registry::client().get(format!("https://api.github.com/user/{}", id.trim()));
    if let Ok(token) = std::env::var("GITHUB_ACCESS_TOKEN") {
        request = request.bearer_auth(token);
    }
    let user: serde_json::Value = request.send().await?.error_for_status()?.json().await?;
    println!(
        "You are logged in as {} ({})",
        user["login"].as_str().unwrap_or_default(),
        user["name"].as_str().unwrap_or_default()
    );
    Ok(())
}
