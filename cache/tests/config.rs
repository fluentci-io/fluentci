use clap::{CommandFactory, FromArgMatches, Parser};
use fluentci_cache::Config;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

#[test]
fn toml_overrides_defaults_and_flags_override_toml() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.toml");
    std::fs::write(&path, "backend = 'memory'\ntoken = 'from-file'\nconcurrency = 7\nmax_upload = 1234\npublic_read = false\n").unwrap();
    let matches = Options::command().get_matches_from([
        "test",
        "--config",
        path.to_str().unwrap(),
        "--concurrency",
        "3",
    ]);
    let config = Options::from_arg_matches(&matches)
        .unwrap()
        .config
        .resolve(&matches)
        .unwrap();
    assert_eq!(config.token.as_deref(), Some("from-file"));
    assert_eq!(config.concurrency, 3);
    assert_eq!(config.max_upload, 1234);
    assert!(!config.public_read);
    assert!(matches!(
        config.backend,
        fluentci_cache::config::Backend::Memory
    ));
}

#[test]
fn unknown_and_invalid_toml_settings_are_rejected() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.toml");
    for contents in [
        "typo = 1",
        "concurrency = 0",
        "backend = 'unknown'",
        "max_upload = -1",
        "public_read = 'yes'",
    ] {
        std::fs::write(&path, contents).unwrap();
        let matches = Options::command().get_matches_from([
            "test",
            "--config",
            path.to_str().unwrap(),
            "--token",
            "test",
        ]);
        assert!(
            Options::from_arg_matches(&matches)
                .unwrap()
                .config
                .resolve(&matches)
                .is_err(),
            "{contents}"
        );
    }
}

#[test]
fn environment_overrides_toml_without_mutating_test_process_environment() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.toml");
    std::fs::write(
        &path,
        "backend = 'memory'\ntoken = 'file-token'\nconcurrency = 7\n",
    )
    .unwrap();
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fluentci-cache"))
        .args([
            "serve",
            "--config",
            path.to_str().unwrap(),
            "--concurrency",
            "0",
        ])
        .env("FLUENTCI_CACHE_CONCURRENCY", "3")
        .output()
        .unwrap();
    // Explicit flag wins even over the environment and therefore fails validation.
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("must be positive"));
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fluentci-cache"))
        .args(["serve", "--config", path.to_str().unwrap()])
        .env("FLUENTCI_CACHE_CONCURRENCY", "0")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("must be positive"));
}

#[test]
fn zero_limits_empty_tokens_and_missing_s3_bucket_fail_early() {
    for args in [
        vec!["test", "--token", ""],
        vec!["test", "--token", "test", "--concurrency", "0"],
        vec!["test", "--token", "test", "--max-upload", "0"],
        vec!["test", "--token", "test", "--timeout", "0"],
    ] {
        assert!(Options::parse_from(args).config.validate().is_err());
    }
    let config = Options::parse_from([
        "test",
        "--token",
        "test",
        "--cdn-url",
        "https://cdn.example.com",
    ])
    .config;
    assert!(config.storage().unwrap_err().to_string().contains("bucket"));
}

#[test]
fn s3_requires_a_public_cdn_url_and_rejects_credentials_or_url_parameters() {
    let mut config = Options::parse_from(["test", "--token", "test"]).config;
    assert!(
        config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("cdn_url is required")
    );
    for url in [
        "",
        "/relative",
        "ftp://cdn.example.com",
        "https://user:password@cdn.example.com",
        "https://cdn.example.com?token=secret",
        "https://cdn.example.com/#fragment",
    ] {
        config.cdn_url = Some(url.into());
        assert!(config.validate().is_err(), "{url}");
    }
    for url in [
        "https://cdn.example.com",
        "https://cdn.example.com/bucket/",
        "http://127.0.0.1:9000/bucket",
    ] {
        config.cdn_url = Some(url.into());
        config.validate().unwrap();
    }
}

#[test]
fn cdn_url_uses_toml_env_and_cli_precedence() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.toml");
    std::fs::write(
        &path,
        "backend = 's3'\ntoken = 'test'\ncdn_url = 'https://cdn.example.com/bucket'\n",
    )
    .unwrap();
    for override_url in [None, Some("https://other.example.com")] {
        let mut args = vec!["test", "--config", path.to_str().unwrap()];
        if let Some(url) = override_url {
            args.extend(["--cdn-url", url]);
        }
        let matches = Options::command().get_matches_from(args);
        let config = Options::from_arg_matches(&matches)
            .unwrap()
            .config
            .resolve(&matches)
            .unwrap();
        assert_eq!(
            config.cdn_url.as_deref(),
            Some(override_url.unwrap_or("https://cdn.example.com/bucket"))
        );
    }
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fluentci-cache"))
        .args(["serve", "--config", path.to_str().unwrap()])
        .env("FLUENTCI_CACHE_CDN_URL", "invalid-env-url")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("cdn_url must be"));
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fluentci-cache"))
        .args([
            "serve",
            "--config",
            path.to_str().unwrap(),
            "--cdn-url",
            "invalid-cli-url",
        ])
        .env("FLUENTCI_CACHE_CDN_URL", "https://valid.example.com")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("cdn_url must be"));
}
