use super::error::{Failure, Result};
use axum::http::StatusCode;
use object_store::path::Path;

pub(super) struct Key {
    pub(super) path: Path,
    pub(super) cas: Option<String>,
    pub(super) content_type: &'static str,
    pub(super) nix_info: bool,
}

pub(super) fn key(raw: &str) -> Result<Key> {
    if raw.len() > 2048
        || raw.contains(['\\', '\0', '%'])
        || raw.chars().any(char::is_control)
        || raw
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
    {
        return Err(Failure(StatusCode::BAD_REQUEST, "invalid cache key\n"));
    }
    let (namespace, rest) = raw.split_once('/').unwrap_or((raw, ""));
    let (namespace, rest) = match namespace {
        "nix" => ("nix", rest),
        "bazel" => ("bazel", rest),
        "ac" | "cas" => ("bazel", raw),
        "gradle" | "sccache" | "maven" | "generic" | "gocache" => (namespace, rest),
        _ if raw.ends_with(".narinfo") || namespace == "nar" || raw == "nix-cache-info" => {
            ("nix", raw)
        }
        _ => return Err(Failure(StatusCode::NOT_FOUND, "unknown cache namespace\n")),
    };
    if rest.is_empty() {
        return Err(Failure(StatusCode::BAD_REQUEST, "cache key required\n"));
    }
    let mut cas = None;
    if namespace == "bazel" {
        let (kind, hash) = rest.split_once('/').ok_or(Failure(
            StatusCode::BAD_REQUEST,
            "expected ac/hash or cas/hash\n",
        ))?;
        if !matches!(kind, "ac" | "cas")
            || hash.len() != 64
            || !hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(Failure(
                StatusCode::BAD_REQUEST,
                "expected lowercase SHA-256 digest\n",
            ));
        }
        if kind == "cas" {
            cas = Some(hash.to_owned());
        }
    }
    let content_type = if namespace == "nix" && rest.ends_with(".narinfo") {
        "text/x-nix-narinfo"
    } else {
        "application/octet-stream"
    };
    Ok(Key {
        path: Path::parse(format!("{namespace}/{rest}"))
            .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid key\n"))?,
        cas,
        content_type,
        nix_info: namespace == "nix" && rest == "nix-cache-info",
    })
}
