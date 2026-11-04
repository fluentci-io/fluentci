use std::{
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

use crate::{exec, Extension};
use anyhow::{anyhow, Context, Error};
use fluentci_types::Output;

#[derive(Default)]
pub struct Flox {}

fn verify(command: &mut Command) -> Result<(), Error> {
    let output = command.arg("--version").output().context(
        "Flox is unavailable; install the native package from https://flox.dev/download/ and put flox on PATH",
    )?;
    if !output.status.success() {
        return Err(crate::worker::output_failure(&output, "Flox version check failed; repair the native Flox installation before executing pipelines"));
    }
    Ok(())
}

// Serialize provisioning within this engine process; a second caller rechecks
// the installed CLI instead of launching another package transaction.
static PROVISION: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn ensure_flox(
    mut command: impl FnMut() -> Command,
    provision: impl FnOnce() -> Result<(), Error>,
) -> Result<(), Error> {
    match command().arg("--version").output() {
        Ok(output) if output.status.success() => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            provision()?;
            verify(&mut command())
        }
        Ok(output) => Err(crate::worker::output_failure(
            &output,
            "Flox version check failed; repair the existing installation",
        )),
        Err(error) => Err(error).context("could not check Flox installation"),
    }
}

fn checked_status(command: &mut Command, phase: &str) -> Result<(), Error> {
    let status = command
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("Flox {phase} could not start"))?;
    if !status.success() {
        return Err(crate::worker::command_failure(
            &status,
            format!("Flox {phase} failed; command was not executed"),
        ));
    }
    Ok(())
}

fn provision_native() -> Result<(), Error> {
    if !matches!(std::env::consts::OS, "linux" | "macos") {
        return Err(anyhow!(
            "automatic Flox provisioning supports Linux and macOS only"
        ));
    }
    if users::get_current_uid() != 0 {
        checked_status(
            Command::new("/usr/bin/sudo").args(["-n", "true"]),
            "privilege check (root or passwordless sudo required)",
        )?;
    }
    let directory =
        tempfile::tempdir().context("could not create private Flox installer directory")?;
    let script = directory.path().join("install.sh");
    crate::bootstrap::download("https://get.flox.dev", &script)?;
    // Prefer native system utilities over old toolchain curl binaries that may
    // reference libraries no longer present on the host. Only this child changes PATH.
    let path = format!(
        "/usr/bin:/bin:/usr/sbin:/sbin:{}",
        std::env::var("PATH").unwrap_or_default()
    );
    checked_status(
        Command::new("/bin/sh")
            .arg(&script)
            .env("PATH", path)
            .env(
                "FLOX_VERSION",
                std::env::var("FLOX_VERSION").unwrap_or_else(|_| "1.19.3".into()),
            )
            .env("FLOX_DISABLE_METRICS", "true"),
        "native installer",
    )
}

fn initialize(command: &mut Command, work_dir: &str) -> Result<(), Error> {
    if std::path::Path::new(work_dir).join(".flox").is_dir() {
        return Ok(());
    }
    let status = command
        .arg("init")
        .current_dir(work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("could not initialize Flox environment")?;
    if !status.success() {
        return Err(crate::worker::command_failure(
            &status,
            "Flox initialization failed; command was not executed",
        ));
    }
    Ok(())
}

impl Extension for Flox {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Flox)
    }

    fn exec(
        &mut self,
        cmd: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;
        if cmd.is_empty() {
            return Ok(ExitStatus::default());
        }
        initialize(&mut Command::new("flox"), work_dir)?;
        exec(
            &format!("flox activate -- {cmd}"),
            tx,
            out,
            last_cmd,
            work_dir,
        )
    }

    fn setup(&self) -> Result<(), Error> {
        let _guard = PROVISION
            .lock()
            .map_err(|_| anyhow!("Flox provisioning lock poisoned"))?;
        ensure_flox(|| Command::new("flox"), provision_native)
    }

    fn format_command(&self, cmd: &str) -> String {
        format!("([ -d .flox ] || flox init) && flox activate -- {cmd}")
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn flox_auto_provision_is_only_used_for_missing_commands_and_is_verified() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let binary = root.path().join("flox");
        ensure_flox(
            || Command::new(&binary),
            || {
                std::fs::write(&binary, "#!/bin/sh\nexit 0\n")?;
                std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700))?;
                Ok(())
            },
        )
        .unwrap();
        ensure_flox(
            || Command::new(&binary),
            || panic!("installed CLI must not reinstall"),
        )
        .unwrap();
        std::fs::write(&binary, "#!/bin/sh\nexit 7\n").unwrap();
        assert!(ensure_flox(
            || Command::new(&binary),
            || panic!("broken CLI must not reinstall")
        )
        .is_err());
        std::fs::remove_file(&binary).unwrap();
        assert!(ensure_flox(
            || Command::new(&binary),
            || Err(anyhow!("fixture download failed"))
        )
        .unwrap_err()
        .to_string()
        .contains("download failed"));
        assert!(
            ensure_flox(|| Command::new(&binary), || Ok(())).is_err(),
            "installer success alone is insufficient"
        );
        let mut failure = Command::new("/bin/sh");
        failure.args(["-c", "exit 12"]);
        assert!(checked_status(&mut failure, "fixture installer")
            .unwrap_err()
            .to_string()
            .contains("command was not executed"));
    }

    #[test]
    fn flox_setup_and_initialization_fail_before_activation() {
        let root = tempfile::tempdir().unwrap();
        let missing = root.path().join("missing");
        assert!(verify(&mut Command::new(missing))
            .unwrap_err()
            .to_string()
            .contains("native package"));
        let mut failed = Command::new("/bin/sh");
        failed.args(["-c", "exit 7", "fixture"]);
        assert!(verify(&mut failed)
            .unwrap_err()
            .to_string()
            .contains("version check failed"));
        let mut installed = Command::new("/bin/sh");
        installed.args(["-c", "test \"$1\" = --version", "fixture"]);
        verify(&mut installed).unwrap();
        let mut failed = Command::new("/bin/sh");
        failed.args(["-c", "exit 9", "fixture"]);
        assert!(initialize(&mut failed, root.path().to_str().unwrap())
            .unwrap_err()
            .to_string()
            .contains("command was not executed"));
        let mut success = Command::new("/bin/sh");
        success.args(["-c", "test \"$1\" = init && /bin/mkdir .flox", "fixture"]);
        initialize(&mut success, root.path().to_str().unwrap()).unwrap();
        initialize(
            &mut Command::new("/not-invoked"),
            root.path().to_str().unwrap(),
        )
        .unwrap();
        let activation = tempfile::tempdir().unwrap();
        let script = format!("flox() {{ if [ \"$1\" = init ]; then return 9; fi; printf activated > activated; }}; {}", Flox::default().format_command("true"));
        let status = Command::new("/bin/sh")
            .args(["-c", &script])
            .current_dir(activation.path())
            .status()
            .unwrap();
        assert!(!status.success());
        assert!(!activation.path().join("activated").exists());
    }
}
