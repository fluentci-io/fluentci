use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

pub(super) struct Failure(pub(super) StatusCode, pub(super) &'static str);

pub(super) type Result<T> = std::result::Result<T, Failure>;

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        let mut response = (self.0, self.1).into_response();
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
        if self.0 == StatusCode::UNAUTHORIZED {
            response.headers_mut().insert(
                header::WWW_AUTHENTICATE,
                "Basic realm=\"fluentci-cache\"".parse().unwrap(),
            );
        }
        response
    }
}

pub(super) fn backend_error(error: object_store::Error) -> Failure {
    match error {
        object_store::Error::NotFound { .. } => Failure(StatusCode::NOT_FOUND, "cache miss\n"),
        object_store::Error::NotModified { .. } => Failure(StatusCode::NOT_MODIFIED, ""),
        object_store::Error::Precondition { .. } => {
            Failure(StatusCode::PRECONDITION_FAILED, "precondition failed\n")
        }
        error => {
            tracing::error!(%error, "cache backend failed");
            Failure(StatusCode::BAD_GATEWAY, "cache backend unavailable\n")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{StatusCode, backend_error};

    #[test]
    fn backend_failure_is_not_a_cache_miss() {
        let failure = backend_error(object_store::Error::Generic {
            store: "test backend",
            source: std::io::Error::other("private storage details").into(),
        });
        assert_eq!(failure.0, StatusCode::BAD_GATEWAY);
        assert_eq!(failure.1, "cache backend unavailable\n");
    }
}
