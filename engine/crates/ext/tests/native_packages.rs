//! Opt-in tests for disposable native CI hosts. These install jq.
use fluentci_ext::{bsd::BsdPackages, Extension};
use fluentci_types::Output;
use std::{sync::mpsc, time::Duration};

fn verify(mut extension: impl Extension) {
    extension.setup().unwrap();
    let (tx, rx) = mpsc::channel();
    let status = extension
        .exec("jq --version", tx, Output::Stdout, true, ".")
        .unwrap();
    assert!(status.success());
    assert!(rx
        .recv_timeout(Duration::from_secs(10))
        .unwrap()
        .contains("jq-"));
}

#[test]
#[ignore = "installs packages; run only on a disposable native BSD CI host"]
fn native_bsd_package_install() {
    let adapter = match std::env::consts::OS {
        "freebsd" => BsdPackages::freebsd(),
        "netbsd" => BsdPackages::netbsd(),
        "openbsd" => BsdPackages::openbsd(),
        other => panic!("requires a BSD host, got {other}"),
    };
    adapter.install(vec!["jq"]).unwrap();
    verify(adapter);
}

#[test]
#[ignore = "installs packages; run only on a disposable supported Homebrew CI host"]
fn native_homebrew_package_install() {
    let adapter = fluentci_ext::homebrew::Homebrew;
    adapter.install(vec!["jq"]).unwrap();
    verify(adapter);
}

#[test]
#[ignore = "installs packages; requires a provisioned disposable macOS host and prefix permissions"]
fn native_macports_package_install() {
    use fluentci_ext::macports::{MacPorts, MacPortsBackend};
    let backend = match std::env::var("FLUENTCI_TEST_MACPORTS_BACKEND").as_deref() {
        Ok("rust") => MacPortsBackend::Rust,
        Ok("native") | Err(_) => MacPortsBackend::Native,
        Ok(value) => panic!("invalid backend {value}"),
    };
    let mut adapter = MacPorts::new(backend);
    if let Ok(binary) = std::env::var("FLUENTCI_TEST_MACPORTS_BINARY") {
        adapter = adapter.with_executable(binary);
    }
    adapter.install(vec!["jq"]).unwrap();
    verify(adapter);
}

#[test]
#[ignore = "installs native Flox and jq; disposable Linux CI hosts only"]
fn native_flox_auto_provision() {
    use std::process::Command;
    if std::env::var_os("FLUENTCI_REQUIRE_FLOX_BOOTSTRAP").is_some() {
        let error = Command::new("flox")
            .arg("--version")
            .output()
            .expect_err("CI must start without Flox to exercise automatic provisioning");
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
    }
    let mut flox = fluentci_ext::flox::Flox::default();
    flox.setup().unwrap();
    let root = tempfile::tempdir().unwrap();
    let (tx, _rx) = mpsc::channel();
    assert!(flox
        .exec(
            "true",
            tx,
            Output::Stdout,
            true,
            root.path().to_str().unwrap()
        )
        .unwrap()
        .success());
    assert!(Command::new("flox")
        .args(["install", "jq"])
        .current_dir(root.path())
        .status()
        .unwrap()
        .success());
    let (tx, rx) = mpsc::channel();
    assert!(flox
        .exec(
            "jq --version",
            tx,
            Output::Stdout,
            true,
            root.path().to_str().unwrap()
        )
        .unwrap()
        .success());
    assert!(rx
        .recv_timeout(Duration::from_secs(10))
        .unwrap()
        .contains("jq-"));
}
