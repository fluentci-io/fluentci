use super::{
    App,
    error::{Failure, Result},
};
use axum::http::{HeaderMap, StatusCode, header};
use base64::{Engine, engine::general_purpose::STANDARD};
use jsonwebtoken::{Algorithm, Validation, decode};
use object_store::path::Path;
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
    #[serde(default)]
    jti: Option<String>,
    #[serde(default)]
    exp: Option<u64>,
}

fn scoped_authorized(
    app: &App,
    headers: &HeaderMap,
    account: Option<&str>,
    scope: &str,
    owner_only: bool,
) -> Result<Option<String>> {
    if (!owner_only || app.config.token.is_some()) && authorized(app, headers, false).is_ok() {
        return Ok(None);
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
        if owner_only {
            validation.set_required_spec_claims(&["exp", "nbf", "iss", "aud", "sub"]);
        } else {
            validation.set_required_spec_claims(&["nbf", "iss", "aud", "sub"]);
        }
        validation.validate_nbf = true;
        validation.leeway = 0;
        if let Ok(data) = decode::<UploadClaims>(&token, key, &validation)
            && (data.claims.cache == account
                || data.claims.cache == super::aliases::legacy_account(account))
            && data.claims.scope == scope
            && data.claims.sub.starts_with("did:")
            && (owner_only
                || data.claims.exp.is_some()
                || data
                    .claims
                    .jti
                    .as_ref()
                    .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok()))
            && (!owner_only || data.claims.sub == account)
        {
            return Ok(data.claims.jti);
        }
    }
    Err(Failure(
        StatusCode::UNAUTHORIZED,
        "authentication required\n",
    ))
}

pub(super) async fn upload_authorized(
    app: &App,
    headers: &HeaderMap,
    account: Option<&str>,
) -> Result<()> {
    if let Some(id) = scoped_authorized(app, headers, account, "cache:upload", false)? {
        let path = revocation_path(account.unwrap_or_default(), &id);
        match tokio::time::timeout(
            std::time::Duration::from_secs(app.config.timeout),
            app.store.head(&path),
        )
        .await
        {
            Ok(Err(object_store::Error::NotFound { .. })) => {}
            Ok(Ok(_)) => return Err(Failure(StatusCode::UNAUTHORIZED, "upload token revoked\n")),
            _ => {
                return Err(Failure(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "token status unavailable\n",
                ));
            }
        }
    }
    Ok(())
}

pub(super) fn manage_authorized(app: &App, headers: &HeaderMap, account: &str) -> Result<()> {
    scoped_authorized(app, headers, Some(account), "cache:manage", true).map(|_| ())
}

pub(super) fn revocation_path(account: &str, id: &str) -> Path {
    Path::parse(format!(
        "_revocations/{account}/{}",
        hex::encode(Sha256::digest(id.as_bytes()))
    ))
    .expect("validated cache storage path")
}
