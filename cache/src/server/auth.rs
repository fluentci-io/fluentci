use super::{
    App,
    error::{Failure, Result},
};
use axum::http::{HeaderMap, StatusCode, header};
use base64::{Engine, engine::general_purpose::STANDARD};
use jsonwebtoken::{Algorithm, Validation, decode};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub(super) fn authorized(app: &App, headers: &HeaderMap, read: bool) -> Result<()> {
    if read && app.config.public_read {
        return Ok(());
    }
    let Some(expected) = &app.config.token else {
        return Ok(());
    };
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    let password = if let Some(token) = auth.strip_prefix("Bearer ") {
        Some(token.to_owned())
    } else if let Some(encoded) = auth.strip_prefix("Basic ") {
        STANDARD
            .decode(encoded)
            .ok()
            .and_then(|v| String::from_utf8(v).ok())
            .and_then(|v| v.split_once(':').map(|(_, password)| password.to_owned()))
    } else {
        None
    };
    // Hash to fixed length before comparison so token length doesn't affect comparison time.
    if password.is_some_and(|p| {
        bool::from(Sha256::digest(p.as_bytes()).ct_eq(&Sha256::digest(expected.as_bytes())))
    }) {
        Ok(())
    } else {
        Err(Failure(
            StatusCode::UNAUTHORIZED,
            "authentication required\n",
        ))
    }
}

#[derive(Deserialize)]
struct UploadClaims {
    cache: String,
    scope: String,
    sub: String,
}

fn scoped_authorized(
    app: &App,
    headers: &HeaderMap,
    account: Option<&str>,
    scope: &str,
    owner_only: bool,
) -> Result<()> {
    if (!owner_only || app.config.token.is_some()) && authorized(app, headers, false).is_ok() {
        return Ok(());
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| {
            if let Some(token) = h.strip_prefix("Bearer ") {
                Some(token.to_owned())
            } else {
                h.strip_prefix("Basic ")
                    .and_then(|v| STANDARD.decode(v).ok())
                    .and_then(|v| String::from_utf8(v).ok())
                    .and_then(|v| v.split_once(':').map(|(_, p)| p.to_owned()))
            }
        });
    if let (Some(key), Some(token), Some(account)) = (&app.upload_key, token, account) {
        let mut validation = Validation::new(Algorithm::EdDSA);
        validation.set_issuer(&[&app.config.upload_token_issuer]);
        validation.set_audience(&["fluentci-cache"]);
        validation.set_required_spec_claims(&["exp", "nbf", "iss", "aud", "sub"]);
        validation.validate_nbf = true;
        validation.leeway = 0;
        if let Ok(data) = decode::<UploadClaims>(&token, key, &validation)
            && data.claims.cache == account
            && data.claims.scope == scope
            && data.claims.sub.starts_with("did:")
            && (!owner_only || hex::encode(Sha256::digest(data.claims.sub.as_bytes())) == account)
        {
            return Ok(());
        }
    }
    Err(Failure(
        StatusCode::UNAUTHORIZED,
        "authentication required\n",
    ))
}

pub(super) fn upload_authorized(
    app: &App,
    headers: &HeaderMap,
    account: Option<&str>,
) -> Result<()> {
    scoped_authorized(app, headers, account, "cache:upload", false)
}

pub(super) fn manage_authorized(app: &App, headers: &HeaderMap, account: &str) -> Result<()> {
    scoped_authorized(app, headers, Some(account), "cache:manage", true)
}
