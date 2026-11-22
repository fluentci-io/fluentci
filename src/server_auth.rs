//! Shared bearer authentication for standalone and cluster API servers.

use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use std::sync::Arc;
use subtle::ConstantTimeEq;

pub(crate) fn validate(token: &str, variable: &str) -> Result<()> {
    ensure!(
        token.len() >= 32 && token.bytes().all(|b| b.is_ascii_graphic()),
        "Set {variable} to a shared secret of at least 32 printable non-space ASCII characters"
    );
    Ok(())
}

pub(crate) fn resolve(configured: Option<&str>, variable: &str) -> Result<String> {
    if let Some(token) = configured {
        validate(token, variable)?;
        return Ok(token.to_owned());
    }
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).context("Cannot generate API token from the OS random source")?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub(crate) fn protect(router: Router, token: Arc<str>) -> Router {
    router.layer(middleware::from_fn_with_state(token, authorize))
}

async fn authorize(State(token): State<Arc<str>>, request: Request, next: Next) -> Response {
    let supplied = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if supplied.is_some_and(|value| bool::from(token.as_bytes().ct_eq(value.as_bytes()))) {
        next.run(request).await
    } else {
        let mut response = StatusCode::UNAUTHORIZED.into_response();
        response.headers_mut().insert(
            header::WWW_AUTHENTICATE,
            "Bearer".parse().expect("Static header"),
        );
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, routing::get};
    use tower::ServiceExt;

    #[test]
    fn tokens_use_os_randomness_or_explicit_configuration() {
        let first = resolve(None, "TOKEN").unwrap();
        let second = resolve(None, "TOKEN").unwrap();
        assert_ne!(first, second);
        assert_eq!(URL_SAFE_NO_PAD.decode(&first).unwrap().len(), 32);
        let fixed = "configured-secret-with-at-least-32-characters";
        assert_eq!(resolve(Some(fixed), "TOKEN").unwrap(), fixed);
        for invalid in [
            "",
            "short",
            "long-enough-but-with-a-space-inside token",
            "long-enough-but-with-a-newline-at-end\n",
        ] {
            assert!(resolve(Some(invalid), "TOKEN").is_err());
        }
    }

    #[tokio::test]
    async fn bearer_token_is_required_for_every_protected_route() {
        let token = resolve(None, "TOKEN").unwrap();
        let app = protect(
            Router::new()
                .route("/graphql", get(|| async { "ok" }))
                .route("/ws", get(|| async { "ok" })),
            token.clone().into(),
        );
        for path in ["/graphql", "/ws"] {
            for authorization in [
                None,
                Some("Bearer incorrect".to_owned()),
                Some(format!("Basic {token}")),
                Some(format!("Bearer {token}")),
            ] {
                let accepted = authorization.as_deref() == Some(&format!("Bearer {token}"));
                let mut request = Request::builder().uri(path);
                if let Some(value) = authorization {
                    request = request.header(header::AUTHORIZATION, value);
                }
                let response = app
                    .clone()
                    .oneshot(request.body(Body::empty()).unwrap())
                    .await
                    .unwrap();
                assert_eq!(
                    response.status(),
                    if accepted {
                        StatusCode::OK
                    } else {
                        StatusCode::UNAUTHORIZED
                    }
                );
                if !accepted {
                    assert_eq!(response.headers()[header::WWW_AUTHENTICATE], "Bearer");
                }
            }
        }
    }
}
