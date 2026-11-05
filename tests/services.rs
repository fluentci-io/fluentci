#![cfg(unix)]

use anyhow::Result;
use serde_json::{Value, json};
use std::{
    process::{Command, Output},
    time::{Duration, Instant},
};

struct Fixture {
    root: tempfile::TempDir,
}

impl Fixture {
    fn new(definitions: Value) -> Result<Self> {
        let root = tempfile::tempdir()?;
        std::fs::write(
            root.path().join("fluentci.toml"),
            toml::to_string(&json!({"services":definitions}))?,
        )?;
        Ok(Self { root })
    }
    fn command(&self, args: &[&str]) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_fluentci"));
        command
            .args(["--check-update=false", "--database"])
            .arg(self.root.path().join("state.sqlite"))
            .args(args)
            .current_dir(self.root.path())
            .env_remove("FLUENTCI_PROJECT_ID");
        command
    }
    fn run(&self, args: &[&str]) -> Result<Output> {
        Ok(self.command(args).output()?)
    }
    fn ok(&self, args: &[&str]) -> Result<String> {
        let output = self.run(args)?;
        anyhow::ensure!(
            output.status.success(),
            "{:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        Ok(String::from_utf8(output.stdout)?)
    }
    fn statuses(&self) -> Result<Vec<Value>> {
        Ok(serde_json::from_str(
            &self.ok(&["services", "status", "--json"])?,
        )?)
    }
    fn wait(&self, name: &str, state: &str) -> Result<Value> {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(status) = self
                .statuses()?
                .into_iter()
                .find(|status| status["name"] == name && status["state"] == state)
            {
                return Ok(status);
            }
            anyhow::ensure!(Instant::now() < deadline, "{name} did not become {state}");
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.command(&["down"]).output();
    }
}

fn foreground(name: &str) -> Value {
    json!({"name":name,"command":format!("echo $$ > {name}.pid; trap 'echo terminated; exit 0' TERM; echo running; while :; do sleep 1; done"),"stop_timeout_ms":500})
}

#[test]
fn host_services_start_idempotently_capture_logs_and_stop() -> Result<()> {
    let fixture = Fixture::new(json!([foreground("clock")]))?;
    fixture.ok(&["up"])?;
    let first = fixture.wait("clock", "running")?;
    fixture.ok(&["start", "clock"])?;
    assert_eq!(fixture.statuses()?[0]["pid"], first["pid"]);
    fixture.ok(&["restart", "clock"])?;
    let restarted = fixture.wait("clock", "running")?;
    assert_ne!(restarted["pid"], first["pid"]);
    fixture.ok(&["stop", "clock"])?;
    assert_eq!(fixture.statuses()?[0]["state"], "stopped");
    let logs = fixture.ok(&["logs", "clock"])?;
    assert!(logs.contains("running"));
    assert!(logs.contains("terminated"));
    fixture.ok(&["down"])?;
    Ok(())
}

#[test]
fn dependency_readiness_is_ordered_and_failed_startup_rolls_back() -> Result<()> {
    let fixture = Fixture::new(json!([
        {"name":"database","command":"trap 'exit 0' TERM; sleep 0.15; touch ready; while :; do sleep 1; done","readiness":{"type":"exec","command":["test","-f","ready"]},"stop_timeout_ms":300},
        {"name":"api","depends_on":["database"],"command":"test -f ready || exit 19; echo dependent-ready; trap 'exit 0' TERM; while :; do sleep 1; done","stop_timeout_ms":300}
    ]))?;
    fixture.ok(&["up"])?;
    assert_eq!(fixture.wait("database", "ready")?["state"], "ready");
    fixture.wait("api", "running")?;
    fixture.ok(&["stop", "database"])?;
    assert!(
        fixture
            .statuses()?
            .iter()
            .all(|status| status["state"] == "stopped")
    );
    fixture.ok(&["down"])?;
    let failed = Fixture::new(json!([
        foreground("database"),
        {"name":"bad","depends_on":["database"],"command":["sh","-c","exit 7"],"readiness":{"type":"exec","command":["false"]},"startup_timeout_ms":500,"stop_timeout_ms":300}
    ]))?;
    assert!(!failed.run(&["up"])?.status.success());
    let statuses = failed.statuses()?;
    assert_eq!(
        statuses
            .iter()
            .find(|status| status["name"] == "database")
            .unwrap()["state"],
        "stopped"
    );
    assert_eq!(
        statuses
            .iter()
            .find(|status| status["name"] == "bad")
            .unwrap()["state"],
        "failed"
    );
    Ok(())
}

#[test]
fn restart_policy_is_bounded_and_programmatic_scopes_clean_up_after_failure() -> Result<()> {
    let fixture = Fixture::new(
        json!([{"name":"crash","command":"echo attempt >> attempts; sleep 0.15; exit 7","restart":"on_failure","max_restarts":2,"restart_backoff_ms":50,"stop_timeout_ms":300}]),
    )?;
    fixture.ok(&["up"])?;
    let failed = fixture.wait("crash", "failed")?;
    assert_eq!(failed["restarts"], 2);
    assert_eq!(
        std::fs::read_to_string(fixture.root.path().join("attempts"))?
            .lines()
            .count(),
        3
    );
    fixture.ok(&["down"])?;
    let scoped = Fixture::new(json!([foreground("database")]))?;
    let output = scoped.run(&["services", "run", "--", "sh", "-c", "exit 9"])?;
    assert!(!output.status.success());
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if scoped
            .statuses()?
            .iter()
            .all(|status| status["pid"].is_null())
        {
            break;
        }
        anyhow::ensure!(Instant::now() < deadline, "Scoped services leaked");
        std::thread::sleep(Duration::from_millis(50));
    }
    let dynamic = Fixture::new(json!([]))?;
    let definitions = serde_json::to_string(&json!([foreground("from-code")]))?;
    dynamic.ok(&["services", "apply", "--json", &definitions])?;
    dynamic.wait("from-code", "running")?;
    dynamic.ok(&["down"])?;
    Ok(())
}

#[test]
fn procfiles_and_graceful_process_group_cleanup_work_without_overmind() -> Result<()> {
    let fixture = Fixture::new(json!([]))?;
    std::fs::write(
        fixture.root.path().join("Procfile"),
        "worker: trap 'kill $child 2>/dev/null; wait $child; exit 0' TERM; sleep 60 & child=$!; echo $child > child.pid; wait $child\n",
    )?;
    fixture.ok(&["up"])?;
    let deadline = Instant::now() + Duration::from_secs(2);
    while !fixture.root.path().join("child.pid").exists() {
        anyhow::ensure!(Instant::now() < deadline, "Child did not start");
        std::thread::sleep(Duration::from_millis(20));
    }
    let pid: i32 = std::fs::read_to_string(fixture.root.path().join("child.pid"))?
        .trim()
        .parse()?;
    fixture.ok(&["down"])?;
    assert_eq!(
        unsafe { libc::kill(pid, 0) },
        -1,
        "Service descendant survived shutdown"
    );
    Ok(())
}

#[test]
fn docker_lifecycle_and_port_discovery_use_the_owning_container() -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new(json!([]))?;
    let bin = fixture.root.path().join("bin");
    std::fs::create_dir(&bin)?;
    let script = bin.join("docker");
    std::fs::write(
        &script,
        "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$DOCKER_CALLS\"\ncase \"$1\" in\nrun) trap 'exit 0' TERM; echo redis-ready; while :; do sleep 1; done;;\nport) echo '6379/tcp -> 127.0.0.1:46379';;\ninspect) echo true;;\nexec|stop|rm) exit 0;;\n*) exit 2;;\nesac\n",
    )?;
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))?;
    let calls = fixture.root.path().join("docker.calls");
    let definitions = serde_json::to_string(
        &json!([{"name":"redis","backend":"docker","image":"redis:7-alpine","ports":["6379"],"readiness":{"type":"exec","command":["redis-cli","ping"]},"stop_timeout_ms":300,"env":{"DOCKER_CALLS":calls.to_string_lossy()}}]),
    )?;
    let path = std::env::join_paths(std::iter::once(bin).chain(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    )))?;
    let output = fixture
        .command(&["services", "apply", "--json", &definitions])
        .env("PATH", &path)
        .env("DOCKER_CALLS", &calls)
        .output()?;
    anyhow::ensure!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        fixture.wait("redis", "ready")?["ports"]["6379/tcp"],
        "127.0.0.1:46379"
    );
    fixture.ok(&["down"])?;
    let calls = std::fs::read_to_string(calls)?;
    assert!(calls.contains("run --rm --name fluentci-"));
    assert!(calls.contains("--publish 127.0.0.1::6379"));
    assert!(calls.contains("stop --time"));
    assert!(calls.contains("rm --force fluentci-"));
    Ok(())
}

#[test]
fn scoped_leases_preserve_manually_started_services_and_shutdown_reaps_children() -> Result<()> {
    let fixture = Fixture::new(json!([foreground("database")]))?;
    fixture.ok(&["up"])?;
    let before = fixture.wait("database", "running")?;
    fixture.ok(&["services", "run", "--", "sh", "-c", "exit 0"])?;
    assert_eq!(fixture.statuses()?[0]["pid"], before["pid"]);
    fixture.ok(&["down"])?;
    let pid = before["pid"].as_u64().unwrap() as i32;
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    Ok(())
}

#[test]
fn persistent_health_failure_is_visible_and_log_rotation_is_bounded() -> Result<()> {
    let fixture = Fixture::new(
        json!([{"name":"database","command":"echo ready; trap 'exit 0' TERM; while :; do sleep 1; done","health":{"type":"exec","command":["false"]},"stop_timeout_ms":300}]),
    )?;
    fixture.ok(&["up"])?;
    fixture.wait("database", "unhealthy")?;
    let fixture = Fixture::new(
        json!([{"name":"writer","command":"i=0; while [ $i -lt 3000 ]; do echo 'a sufficiently long log message'; i=$((i+1)); done; trap 'exit 0' TERM; while :; do sleep 1; done","log_max_bytes":4096,"stop_timeout_ms":300}]),
    )?;
    fixture.ok(&["up"])?;
    std::thread::sleep(Duration::from_millis(300));
    fixture.ok(&["stop", "writer"])?;
    let directory = fixture.root.path().join(".fluentci/services");
    assert!(directory.join("writer.log.1").exists());
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with("writer.log")
        {
            assert!(entry.metadata()?.len() <= 16 * 1024);
        }
    }
    Ok(())
}
