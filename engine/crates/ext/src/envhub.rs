use std::{
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

use crate::{bootstrap, exec_with_env, nix::Nix, Extension};
use anyhow::{anyhow, Context, Error};
use fluentci_types::Output;

#[derive(Default)]
pub struct Envhub {}

impl Envhub {
    pub fn r#use(&self, environment: &str, work_dir: &str) -> Result<ExitStatus, Error> {
        let guard = NixGuard::new()?;
        let status = guard
            .command("envhub")
            .args(["use", environment])
            .current_dir(work_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()?;
        guard.check(status, "Envhub environment activation")
    }
}

impl Extension for Envhub {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Envhub)
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

        let guard = NixGuard::new()?;
        let status = exec_with_env(cmd, tx, out, last_cmd, work_dir, &guard.environment())?;
        guard.check(status, "Envhub command")
    }

    fn format_command(&self, cmd: &str) -> String {
        // Expand caller settings only in the child; do not embed tokens in logs.
        format!(
            "NIX_CONFIG=\"${{NIX_CONFIG-}}\nextra-experimental-features = nix-command flakes\n\" bash -c {}",
            bootstrap::quote(cmd)
        )
    }

    fn setup(&self) -> Result<(), Error> {
        Nix::default().setup()?;
        let home = dirs::home_dir()
            .ok_or_else(|| anyhow!("Envhub installation requires a home directory"))?;
        let bin = home.join(".local/bin");
        let mut paths: Vec<_> =
            std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
        if !paths.contains(&bin) {
            paths.push(bin.clone());
            std::env::set_var("PATH", std::env::join_paths(paths)?);
        }
        let available = Command::new("/bin/sh")
            .args(["-c", "command -v envhub >/dev/null 2>&1"])
            .status()?;
        if !available.success() {
            let (target, checksum) = release_for(std::env::consts::OS, std::env::consts::ARCH)?;
            let temporary = tempfile::tempdir()?;
            let archive = temporary.path().join("envhub.tar.gz");
            let url = format!("https://github.com/tsirysndr/envhub/releases/download/v0.3.0/envhub_v0.3.0_{target}.tar.gz");
            bootstrap::download(&url, &archive)?;
            verify_archive(&archive, checksum)?;
            install_archive(&archive, &bin.join("envhub"))?;
        }
        let guard = NixGuard::new()?;
        initialize_home_manager(&guard, &home)?;
        let status = guard.command("envhub").arg("--version").status()?;
        guard.check(status, "Envhub release binary verification")?;
        Ok(())
    }
}

// Envhub 0.3 ignores some Nix subprocess exit codes. Record those failures in a
// private invocation directory so they cannot turn into a successful pipeline.
struct NixGuard {
    _directory: tempfile::TempDir,
    failure: std::path::PathBuf,
    path: String,
    config: String,
}

impl NixGuard {
    fn new() -> Result<Self, Error> {
        let output = Command::new("/bin/sh")
            .args(["-c", "command -v nix"])
            .output()?;
        if !output.status.success() {
            return Err(anyhow!("Envhub requires an installed Nix executable"));
        }
        let binary = std::path::PathBuf::from(String::from_utf8(output.stdout)?.trim());
        Self::with_binary(&binary, &std::env::var("NIX_CONFIG").unwrap_or_default())
    }

    fn with_binary(binary: &std::path::Path, config: &str) -> Result<Self, Error> {
        let binary = if binary.is_absolute() {
            binary.to_path_buf()
        } else {
            std::env::current_dir()?.join(binary)
        };
        if !binary.is_file() {
            return Err(anyhow!(
                "Envhub Nix executable does not exist: {}",
                binary.display()
            ));
        }
        let directory = tempfile::tempdir()?;
        let failure = directory.path().join("nix-failure");
        let wrapper = directory.path().join("nix");
        std::fs::write(&wrapper, format!(
            "#!/bin/sh\n{} \"$@\"\nstatus=$?\nif [ \"$status\" -ne 0 ]; then printf '%s\\n' \"$status\" >> {}; fi\nexit \"$status\"\n",
            bootstrap::quote(&binary.to_string_lossy()), bootstrap::quote(&failure.to_string_lossy())
        ))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o755))?;
        }
        let inherited = std::env::var_os("PATH").unwrap_or_default();
        let paths = std::iter::once(directory.path().to_path_buf())
            .chain(std::env::split_paths(&inherited));
        let path = std::env::join_paths(paths)?
            .into_string()
            .map_err(|_| anyhow!("Envhub PATH must be UTF-8"))?;
        Ok(Self {
            _directory: directory,
            failure,
            path,
            config: nix_config(config),
        })
    }

    fn environment(&self) -> [(&str, &str); 2] {
        [("PATH", &self.path), ("NIX_CONFIG", &self.config)]
    }

    fn command(&self, program: impl AsRef<std::ffi::OsStr>) -> Command {
        let mut command = Command::new(program);
        command.envs(self.environment());
        command
    }

    fn check(&self, status: ExitStatus, operation: &str) -> Result<ExitStatus, Error> {
        if self.failure.exists() {
            return Err(anyhow!(
                "{operation} failed: an internal Nix command failed; pipeline stopped"
            ));
        }
        if !status.success() {
            return Err(crate::worker::command_failure(
                &status,
                format!("{operation} failed; pipeline stopped"),
            ));
        }
        Ok(status)
    }
}

fn nix_config(existing: &str) -> String {
    format!("{existing}\nextra-experimental-features = nix-command flakes\n")
}

fn initialize_home_manager(guard: &NixGuard, home: &std::path::Path) -> Result<(), Error> {
    let directory = home.join(".envhub/home-manager");
    let complete = || {
        ["home.nix", "flake.nix"].iter().all(|name| {
            std::fs::metadata(directory.join(name))
                .map(|m| m.is_file() && m.len() > 0)
                .unwrap_or(false)
        })
    };
    if !complete() {
        let status = guard
            .command("nix")
            .args(["run", "home-manager/master", "--", "init"])
            .arg(&directory)
            .stdin(Stdio::null())
            .status()?;
        guard.check(status, "Envhub Home Manager initialization")?;
        if !complete() {
            return Err(anyhow!(
                "Envhub Home Manager initialization did not create home.nix and flake.nix"
            ));
        }
    }
    Ok(())
}

fn release_for(os: &str, arch: &str) -> Result<(&'static str, &'static str), Error> {
    match (os, arch) {
        ("linux", "x86_64") => Ok((
            "x86_64-unknown-linux-gnu",
            "b5277e7c4c19ab33ae3e1f64e0310b0ac842e81ac4a73a5488239ec0d4620770",
        )),
        ("linux", "aarch64") => Ok((
            "aarch64-unknown-linux-gnu",
            "907530ce2c663cbf7b61f9fb0abed7dd60e24b57d0eacbcd54c65c19863fdbde",
        )),
        ("macos", "x86_64") => Ok((
            "x86_64-apple-darwin",
            "a043429f801bbff0a8fcd2d0f13254d8c686306f78637e90b061a6a4261112a1",
        )),
        ("macos", "aarch64") => Ok((
            "aarch64-apple-darwin",
            "75284bb43865a7506bca65fe79ee802e9943fde2af1e2da87e9285541dfca7df",
        )),
        _ => Err(anyhow!("no pinned Envhub binary for {os}/{arch}")),
    }
}

fn verify_archive(path: &std::path::Path, expected: &str) -> Result<(), Error> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    if hex_digest(digest.finalize().as_slice()) != expected {
        return Err(anyhow!("Envhub release archive checksum mismatch"));
    }
    Ok(())
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn install_archive(archive: &std::path::Path, destination: &std::path::Path) -> Result<(), Error> {
    let extracted = tempfile::tempdir()?;
    let status = Command::new("/usr/bin/tar")
        .arg("-xzf")
        .arg(archive)
        .arg("-C")
        .arg(extracted.path())
        .arg("envhub")
        .status()?;
    if !status.success() {
        return Err(crate::worker::command_failure(
            &status,
            "Envhub archive extraction failed",
        ));
    }
    let executable = extracted.path().join("envhub");
    if !std::fs::symlink_metadata(&executable)?
        .file_type()
        .is_file()
    {
        return Err(anyhow!(
            "Envhub archive does not contain a regular executable"
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| anyhow!("invalid Envhub destination"))?;
    std::fs::create_dir_all(parent)?;
    let staging = tempfile::NamedTempFile::new_in(parent)?;
    std::fs::copy(executable, staging.path())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(staging.path(), std::fs::Permissions::from_mode(0o755))?;
    }
    staging
        .persist(destination)
        .context("could not publish Envhub binary")?;
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn mock_nix(root: &std::path::Path, script: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let binary = root.join("real nix");
        std::fs::write(&binary, format!("#!/bin/sh\n{script}\n")).unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
        binary
    }

    #[test]
    fn ignored_internal_nix_failures_stop_envhub_and_preserve_parent_config() {
        let root = tempfile::tempdir().unwrap();
        let binary = mock_nix(root.path(), "exit 23");
        let guard = NixGuard::with_binary(
            &binary,
            "sandbox = false\nextra-experimental-features = ca-derivations",
        )
        .unwrap();
        let status = guard
            .command("/bin/sh")
            .args(["-c", "nix run ignored; exit 0"])
            .status()
            .unwrap();
        assert!(status.success());
        assert!(guard
            .check(status, "activation")
            .unwrap_err()
            .to_string()
            .contains("internal Nix command failed"));
        assert!(guard.config.contains("sandbox = false"));
        assert!(guard.config.contains("ca-derivations"));
        assert!(guard
            .config
            .contains("extra-experimental-features = nix-command flakes"));
    }

    #[test]
    fn home_manager_initialization_is_checked_and_requires_both_files() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("home");
        let binary = mock_nix(root.path(), "exit 7");
        let guard = NixGuard::with_binary(&binary, "").unwrap();
        assert!(initialize_home_manager(&guard, &home).is_err());
        drop(guard);
        mock_nix(root.path(), "exit 0");
        let guard = NixGuard::with_binary(&binary, "").unwrap();
        assert!(initialize_home_manager(&guard, &home)
            .unwrap_err()
            .to_string()
            .contains("did not create"));
        drop(guard);
        mock_nix(
            root.path(),
            r#"
case "$NIX_CONFIG" in *'nix-command flakes'*) ;; *) exit 81 ;; esac
for target do :; done
mkdir -p "$target"
printf home > "$target/home.nix"
printf flake > "$target/flake.nix"
"#,
        );
        let guard = NixGuard::with_binary(&binary, "").unwrap();
        initialize_home_manager(&guard, &home).unwrap();
        // A complete existing initialization must not rerun Nix.
        std::fs::remove_file(&binary).unwrap();
        initialize_home_manager(&guard, &home).unwrap();
    }

    #[test]
    fn envhub_service_commands_preserve_required_nix_features() {
        let command = Envhub::default().format_command("printf hello");
        assert!(command.starts_with("NIX_CONFIG="));
        assert!(command.contains("nix-command flakes"));
        assert!(command.ends_with("bash -c 'printf hello'"));
    }

    #[test]
    fn github_release_platforms_and_checksum_validation() {
        for os in ["linux", "macos"] {
            for arch in ["x86_64", "aarch64"] {
                let (target, checksum) = release_for(os, arch).unwrap();
                assert!(target.starts_with(arch));
                assert_eq!(checksum.len(), 64);
            }
        }
        assert!(release_for("freebsd", "x86_64").is_err());
        assert!(release_for("linux", "arm").is_err());
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("download");
        std::fs::write(&file, "bad download").unwrap();
        assert!(verify_archive(&file, release_for("linux", "x86_64").unwrap().1).is_err());
    }
    #[test]
    fn installs_only_archive_binary_into_requested_directory() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("envhub"), "#!/bin/sh\nexit 0\n").unwrap();
        let archive = root.path().join("fixture.tar.gz");
        assert!(Command::new("/usr/bin/tar")
            .arg("-czf")
            .arg(&archive)
            .arg("-C")
            .arg(root.path())
            .arg("envhub")
            .status()
            .unwrap()
            .success());
        let destination = root.path().join("bin/envhub");
        install_archive(&archive, &destination).unwrap();
        assert!(Command::new(&destination)
            .arg("--version")
            .status()
            .unwrap()
            .success());
    }
}
