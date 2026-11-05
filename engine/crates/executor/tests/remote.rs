#![cfg(unix)]

use fluentci_executor::{
    cache::CachePolicy,
    primitives,
    remote::{self, Action, Algorithm, Input, Operation, Ssh},
    workflow::OutputRef,
    Cancellation, Plan, Task,
};
use std::{collections::BTreeMap, fs, os::unix::fs::PermissionsExt, path::Path};
use tempfile::TempDir;

fn plan(tasks: Vec<Task>) -> Plan {
    Plan {
        workspace: None,
        version: 1,
        tasks,
        jobs: 4,
        max_services: 8,
        fail_fast: true,
        inherit_env: false,
        cache_dir: None,
        resource_dir: None,
    }
}

fn fake(root: &Path, tool: &str, body: &str) {
    let file = root.join(tool);
    fs::write(&file, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(file, fs::Permissions::from_mode(0o755)).unwrap();
}

#[test]
fn typed_facts_and_streamed_digests_compose_through_value_outputs() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("input"), "abc").unwrap();
    let mut consumer = primitives::exec(
        "consumer",
        "/bin/sh",
        vec!["-c".into(), "printf '%s' \"$DIGEST\"".into()],
        dir.path(),
    );
    consumer.needs = vec!["text".into()];
    consumer.policy.bindings.insert(
        "DIGEST".into(),
        OutputRef {
            task: "text".into(),
            name: "value".into(),
        },
    );
    let compiled = plan(vec![
        remote::task("os", Operation::Os, dir.path()),
        remote::task("arch", Operation::Arch, dir.path()),
        remote::task(
            "text",
            Operation::Digest {
                algorithm: Algorithm::Sha256,
                input: Input::Text("abc".into()),
            },
            dir.path(),
        ),
        remote::task(
            "file",
            Operation::Digest {
                algorithm: Algorithm::Sha512,
                input: Input::File("input".into()),
            },
            dir.path(),
        ),
        consumer,
    ])
    .compile()
    .unwrap();
    for name in ["first", "second"] {
        let result = compiled
            .execute(&dir.path().join(name), &Cancellation::default())
            .unwrap();
        assert!(result.success(), "{result:?}");
        assert_eq!(result.tasks[0].outputs["value"], std::env::consts::OS);
        assert_eq!(result.tasks[1].outputs["value"], std::env::consts::ARCH);
        assert_eq!(
            result.tasks[2].outputs["value"],
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(result.tasks[3].outputs["value"], "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
        assert_eq!(
            fs::read_to_string(&result.tasks[4].stdout).unwrap(),
            result.tasks[2].outputs["value"]
        );
    }
}

#[test]
fn pure_cache_restores_value_and_invalidates_when_input_changes() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("input"), "abc").unwrap();
    let mut task = remote::task(
        "hash",
        Operation::Digest {
            algorithm: Algorithm::Sha256,
            input: Input::File("input".into()),
        },
        dir.path(),
    );
    task.cache = Some(CachePolicy {
        inputs: vec!["input".into()],
        outputs: vec![],
        toolchain: "native-digest-v1".into(),
        toolchain_files: vec![],
        relocatable: false,
    });
    let mut p = plan(vec![task]);
    p.cache_dir = Some(dir.path().join("cache"));
    let first = p
        .execute(&dir.path().join("first"), &Cancellation::default())
        .unwrap();
    let second = p
        .execute(&dir.path().join("second"), &Cancellation::default())
        .unwrap();
    assert!(first.success() && second.success());
    assert_eq!(second.tasks[0].cache.outcome, "hit");
    assert_eq!(first.tasks[0].outputs, second.tasks[0].outputs);
    fs::write(dir.path().join("input"), "changed").unwrap();
    let third = p
        .execute(&dir.path().join("third"), &Cancellation::default())
        .unwrap();
    assert!(third.success());
    assert_ne!(first.tasks[0].outputs, third.tasks[0].outputs);
}

#[test]
fn ssh_preserves_argument_boundaries_and_ipv6_host() {
    let dir = TempDir::new().unwrap();
    fake(dir.path(), "ssh", "printf '%s\\n' \"$@\"");
    let mut task = remote::task(
        "ssh",
        Operation::Ssh {
            connection: Ssh {
                host: "::1".into(),
                user: Some("deploy".into()),
                port: 2222,
                identity: None,
                install: false,
            },
            command: vec!["printf".into(), "space ' quote; $HOME".into()],
        },
        dir.path(),
    );
    task.env
        .insert("PATH".into(), dir.path().to_string_lossy().into_owned());
    let result = plan(vec![task])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    let output = fs::read_to_string(&result.tasks[0].stdout).unwrap();
    assert!(output.contains("deploy@::1\n"));
    assert!(output.contains("'printf' 'space '\\'' quote; $HOME'\n"));
}

#[test]
fn ftp_credentials_are_private_and_temporary_configuration_is_removed() {
    let dir = TempDir::new().unwrap();
    fake(dir.path(), "curl", "printf '%s\\n' \"$@\"; while [ \"$#\" -gt 0 ]; do if [ \"$1\" = --config ]; then shift; /bin/cat \"$1\" > captured; fi; shift; done");
    let mut task = remote::task(
        "upload",
        Operation::Ftps {
            url: "ftp://example.com/plugin.wasm".into(),
            action: Action::Put,
            path: Some("input".into()),
            username_env: Some("FTP_USER".into()),
            password_env: Some("FTP_PASSWORD".into()),
            install: false,
        },
        dir.path(),
    );
    task.env = BTreeMap::from([
        ("PATH".into(), dir.path().to_string_lossy().into_owned()),
        ("FTP_USER".into(), "tester".into()),
        ("FTP_PASSWORD".into(), "secret-value".into()),
    ]);
    let result = plan(vec![task])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    let output = fs::read_to_string(&result.tasks[0].stdout).unwrap();
    assert!(!output.contains("secret-value"));
    assert!(output.contains("--ssl-reqd"));
    let lines: Vec<_> = output.lines().collect();
    let index = lines.iter().position(|arg| *arg == "--config").unwrap();
    assert!(!Path::new(lines[index + 1]).exists());
    assert!(fs::read_to_string(dir.path().join("captured"))
        .unwrap()
        .contains("tester:secret-value"));
}

#[test]
fn installation_plans_cover_posix_platforms_without_installing_anything() {
    for (os, manager) in [
        ("macos", "brew"),
        ("macos", "port"),
        ("linux", "apt-get"),
        ("linux", "dnf"),
        ("linux", "apk"),
        ("linux", "pacman"),
        ("linux", "zypper"),
        ("freebsd", "pkg"),
        ("netbsd", "pkgin"),
        ("openbsd", "pkg_add"),
    ] {
        for tool in ["ssh", "scp", "sftp", "rsync", "curl", "aws"] {
            let command = remote::installation(os, manager, tool).unwrap();
            assert_eq!(command[0], manager);
            assert!(command.len() >= 3);
        }
    }
    assert!(remote::installation("windows", "brew", "ssh").is_err());
}

#[test]
fn ftp_delete_decodes_path_and_never_fetches_the_deleted_file() {
    let dir = TempDir::new().unwrap();
    fake(dir.path(), "curl", "printf '%s\\n' \"$@\"");
    let mut task = remote::task(
        "delete",
        Operation::Ftp {
            url: "ftp://example.com/a%20file.wasm".into(),
            action: Action::Delete,
            path: None,
            username_env: None,
            password_env: None,
            install: false,
        },
        dir.path(),
    );
    task.env
        .insert("PATH".into(), dir.path().to_string_lossy().into_owned());
    let result = plan(vec![task])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    let output = fs::read_to_string(&result.tasks[0].stdout).unwrap();
    assert!(output.contains("DELE /a file.wasm\n"));
    assert!(output.contains("--head\n"));
    assert!(output.ends_with("--url\nftp://example.com/\n"));
}

#[test]
fn remote_effects_and_incomplete_credentials_fail_before_execution() {
    let dir = TempDir::new().unwrap();
    let mut task = remote::task(
        "remote",
        Operation::S3 {
            bucket: "modules".into(),
            key: "file.wasm".into(),
            action: Action::List,
            path: None,
            endpoint: None,
            region: None,
            install: false,
        },
        dir.path(),
    );
    task.cache = Some(CachePolicy {
        inputs: vec![],
        outputs: vec![],
        toolchain: "v1".into(),
        toolchain_files: vec![],
        relocatable: false,
    });
    assert!(plan(vec![task])
        .validate()
        .unwrap_err()
        .contains("cannot be action cached"));
    let invalid = Operation::Ftp {
        url: "ftp://example.com/file".into(),
        action: Action::List,
        path: None,
        username_env: None,
        password_env: Some("PASSWORD".into()),
        install: false,
    };
    assert!(invalid
        .validate()
        .unwrap_err()
        .contains("requires username_env"));
}

#[test]
fn native_client_timeout_stops_the_process_group() {
    let dir = TempDir::new().unwrap();
    fake(dir.path(), "aws", "/bin/sleep 30 &\nwait");
    let mut task = remote::task(
        "timeout",
        Operation::S3 {
            bucket: "modules".into(),
            key: "".into(),
            action: Action::List,
            path: None,
            endpoint: None,
            region: None,
            install: false,
        },
        dir.path(),
    );
    task.env
        .insert("PATH".into(), dir.path().to_string_lossy().into_owned());
    task.timeout_ms = Some(100);
    let started = std::time::Instant::now();
    let result = plan(vec![task])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, fluentci_executor::Status::TimedOut);
    assert!(started.elapsed() < std::time::Duration::from_secs(5));
}
