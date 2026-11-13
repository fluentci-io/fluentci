use super::{
    App,
    error::{Failure, Result},
};
use axum::http::{HeaderMap, StatusCode, header};
use base64::{Engine, engine::general_purpose::STANDARD};
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
