#![cfg(any(
    target_os = "macos",
    all(target_os = "linux", target_arch = "x86_64"),
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
use fluentci_executor::{Cancellation, Plan, Status};
use serde_json::{json, Value};
use std::{fs, os::unix::fs::PermissionsExt, path::Path};
fn provider(executable: &Path) -> Value {
    let manager = match std::env::consts::OS {
        "macos" => "macports",
        "linux" => "homebrew",
        "freebsd" => "freebsd",
        "netbsd" => "netbsd",
        "openbsd" => "openbsd",
        _ => panic!("unsupported fixture platform"),
    };
    json!({"manager":manager,"executable":executable})
}
fn fixture(root: &Path, script: &str) -> Value {
    let path = root.join("manager");
    fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
    provider(&path)
}
fn plan(root: &Path, tasks: Vec<Value>) -> Plan {
    serde_json::from_value(
        json!({"jobs":3,"inherit_env":false,"resource_dir":root.join("locks"),"tasks": tasks}),
    )
    .unwrap()
}
fn install(root: &Path, id: &str, p: &Value, packages: &[&str], needs: &[&str]) -> Value {
    json!({"id":id,"cwd":root,"needs":needs,"package_install":{"provider":p,"packages":packages}})
}
fn consumer(root: &Path, id: &str, p: &Value, script: &str, needs: &[&str]) -> Value {
    json!({"id":id,"cwd":root,"needs":needs,"program":"/bin/sh","args":["-c",script],"package_environment":[p],"timeout_ms":2000})
}
#[test]
fn explicit_install_is_logged_and_shared_consumers_overlap_but_exclude_updates() {
    let root = tempfile::tempdir().unwrap();
    let p = fixture(root.path(), "test ! -e reading-a && test ! -e reading-b || exit 90; printf '%s\\n' \"$@\" >> args; echo installed");
    let plan = plan(root.path(), vec![
        install(root.path(),"install",&p,&["alpha@1.2","owner/tap/pkg"],&[]),
        consumer(root.path(),"a",&p,"touch reading-a; touch started-a; while [ ! -e started-b ]; do sleep 0.01; done; sleep 0.05; rm reading-a",&["install"]),
        consumer(root.path(),"b",&p,"touch reading-b; touch started-b; while [ ! -e started-a ]; do sleep 0.01; done; sleep 0.05; rm reading-b",&["install"]),
        install(root.path(),"update",&p,&["next"],&["install"]),
    ]);
    let before = std::env::var_os("PATH");
    let result = plan
        .execute(&root.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    assert_eq!(std::env::var_os("PATH"), before);
    let args = fs::read_to_string(root.path().join("args")).unwrap();
    assert!(args.contains("alpha@1.2\nowner/tap/pkg\n"));
    assert_eq!(
        fs::read_to_string(&result.tasks[0].stdout).unwrap(),
        "installed\n"
    );
    let events = fs::read_to_string(root.path().join("run/events.jsonl")).unwrap();
    assert!(events.contains("resource: package-prefix:"));
}
#[test]
fn installation_failure_skips_consumers_and_invalid_specs_have_no_effects() {
    let root = tempfile::tempdir().unwrap();
    let p = fixture(root.path(), "exit 7");
    let tasks = vec![
        install(root.path(), "install", &p, &["alpha"], &[]),
        consumer(root.path(), "use", &p, "touch unexpected", &["install"]),
    ];
    let result = plan(root.path(), tasks)
        .execute(&root.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::Failed);
    assert_eq!(result.tasks[1].status, Status::Skipped);
    assert!(!root.path().join("unexpected").exists());
    for bad in ["--force", "name;touch unexpected", "$(echo bad)"] {
        assert!(plan(
            root.path(),
            vec![install(root.path(), "bad", &p, &[bad], &[])]
        )
        .validate()
        .is_err());
    }
    let mut cached = install(root.path(), "bad", &p, &["alpha"], &[]);
    cached["cache"] = json!({"inputs":[],"outputs":[],"toolchain":"bad"});
    assert!(plan(root.path(), vec![cached])
        .validate()
        .unwrap_err()
        .contains("uncached"));
}
#[test]
fn provider_environment_and_backend_are_applied_to_direct_commands_and_cache_keys() {
    let root = tempfile::tempdir().unwrap();
    let p = fixture(root.path(), "echo selected");
    let name = match std::env::consts::OS {
        "macos" => "port",
        "linux" => "brew",
        "freebsd" => "pkg",
        "netbsd" => "pkgin",
        _ => "pkg_add",
    };
    let mut command = consumer(root.path(), "use", &p, "", &[]);
    command["program"] = name.into();
    command["args"] = json!([]);
    let result = plan(root.path(), vec![command])
        .execute(&root.path().join("pinned"), &Cancellation::default())
        .unwrap();
    assert!(result.success());
    assert_eq!(
        fs::read_to_string(&result.tasks[0].stdout).unwrap(),
        "selected\n"
    );
    let mut command = consumer(
        root.path(),
        "build",
        &p,
        "printf '%s' \"$PATH\" > output",
        &[],
    );
    command["cache"] = json!({"inputs":[],"outputs":["output"],"toolchain":"fixture-toolchain"});
    let mut plan = plan(root.path(), vec![command]);
    plan.cache_dir = Some(root.path().join("cache"));
    let cold = plan
        .execute(&root.path().join("cold"), &Cancellation::default())
        .unwrap();
    assert!(cold.success(), "{cold:?}");
    let warm = plan
        .execute(&root.path().join("warm"), &Cancellation::default())
        .unwrap();
    assert_eq!(warm.tasks[0].cache.outcome, "hit");
    let path = fs::read_to_string(root.path().join("output")).unwrap();
    let entries: Vec<_> = std::env::split_paths(&path).collect();
    assert_eq!(
        entries[0],
        Path::new(expected_bin(p["manager"].as_str().unwrap()))
    );
    assert_eq!(entries[2], root.path());
}

fn expected_bin(manager: &str) -> &'static str {
    match (manager, std::env::consts::OS) {
        ("macports", _) => "/opt/local/bin",
        ("homebrew", "macos") => "/opt/homebrew/bin",
        ("homebrew", _) => "/home/linuxbrew/.linuxbrew/bin",
        ("netbsd", _) => "/usr/pkg/bin",
        _ => "/usr/local/bin",
    }
}

#[test]
#[ignore = "installs jq; run only on a disposable native package-manager CI host"]
fn native_package_plan_install() {
    let root = tempfile::tempdir().unwrap();
    let manager = std::env::var("FLUENTCI_TEST_PACKAGE_MANAGER").unwrap_or_else(|_| {
        match std::env::consts::OS {
            "macos" | "linux" => "homebrew",
            "freebsd" => "freebsd",
            "netbsd" => "netbsd",
            "openbsd" => "openbsd",
            _ => panic!("unsupported native host"),
        }
        .into()
    });
    let mut provider = json!({"manager":manager});
    if let Ok(executable) = std::env::var("FLUENTCI_TEST_PACKAGE_EXECUTABLE") {
        provider["executable"] = executable.into();
    }
    if let Ok(backend) = std::env::var("FLUENTCI_TEST_MACPORTS_BACKEND") {
        provider["backend"] = backend.into();
    }
    let mut consume = consumer(root.path(), "jq", &provider, "", &["install"]);
    consume["program"] = "/bin/sh".into();
    consume["args"] = json!(["-c", "command -v jq; exec jq --version"]);
    let mut plan = plan(
        root.path(),
        vec![
            install(root.path(), "install", &provider, &["jq"], &[]),
            consume,
        ],
    );
    plan.inherit_env = true;
    plan.tasks[0].timeout_ms = Some(600_000);
    let result = plan
        .execute(&root.path().join("run"), &Cancellation::default())
        .unwrap();
    if !result.success() {
        for task in &result.tasks {
            eprintln!(
                "{} stdout:\n{}\nstderr:\n{}",
                task.id,
                fs::read_to_string(&task.stdout).unwrap_or_default(),
                fs::read_to_string(&task.stderr).unwrap_or_default()
            );
        }
    }
    assert!(result.success(), "{result:?}");
    let stdout = fs::read_to_string(&result.tasks[1].stdout).unwrap();
    let mut lines = stdout.lines();
    assert_eq!(
        lines.next().unwrap(),
        format!("{}/jq", expected_bin(&manager))
    );
    assert!(lines.next().unwrap().starts_with("jq-"));
}
