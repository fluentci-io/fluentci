//! Native curl and checked installer downloads. Bootstrap children prefer OS
//! utilities; the pipeline's PATH remains unchanged.
use anyhow::{anyhow, Context, Error};
use std::{
    path::Path,
    process::{Command, Stdio},
};

pub fn native_curl() -> &'static str {
    match std::env::consts::OS {
        "freebsd" | "openbsd" => "/usr/local/bin/curl",
        "netbsd" => "/usr/pkg/bin/curl",
        _ => "/usr/bin/curl",
    }
}

fn checked(command: &mut Command, phase: &str) -> Result<(), Error> {
    let status = command
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("{phase} could not start"))?;
    if !status.success() {
        return Err(crate::worker::command_failure(
            &status,
            format!("{phase} failed; setup stopped"),
        ));
    }
    Ok(())
}

pub fn download(url: &str, destination: &Path) -> Result<(), Error> {
    download_with(Path::new(native_curl()), url, destination)
}

fn download_with(curl: &Path, url: &str, destination: &Path) -> Result<(), Error> {
    let parent = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let staging = tempfile::NamedTempFile::new_in(parent)?;
    let protocols = if url.starts_with("https://") {
        "=https"
    } else {
        "=http,https"
    };
    checked(
        Command::new(curl)
            .args([
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--proto",
                protocols,
                "--proto-redir",
                protocols,
                "--connect-timeout",
                "15",
                "--max-time",
                "120",
                "--output",
            ])
            .arg(staging.path())
            .arg("--url")
            .arg(url),
        "OS curl download",
    )?;
    staging
        .persist(destination)
        .map_err(|e| anyhow!("could not publish download: {}", e.error))?;
    Ok(())
}

pub(crate) fn install(
    program: &str,
    url: &str,
    shell: &str,
    args: &[&str],
    environment: &[(&str, &str)],
) -> Result<(), Error> {
    install_with(
        Path::new(native_curl()),
        program,
        url,
        shell,
        args,
        environment,
    )
}

fn available(program: &str) -> Result<bool, Error> {
    Ok(Command::new("/bin/sh")
        .args([
            "-c",
            "command -v \"$1\" >/dev/null 2>&1",
            "fluentci-bootstrap",
            program,
        ])
        .status()?
        .success())
}

fn install_with(
    curl: &Path,
    program: &str,
    url: &str,
    shell: &str,
    args: &[&str],
    environment: &[(&str, &str)],
) -> Result<(), Error> {
    if available(program)? {
        return Ok(());
    }
    let temporary = tempfile::tempdir()?;
    let script = temporary.path().join("installer.sh");
    download_with(curl, url, &script)?;
    let path = format!(
        "/usr/bin:/bin:/usr/sbin:/sbin:{}",
        std::env::var("PATH").unwrap_or_default()
    );
    checked(
        Command::new(shell)
            .arg(&script)
            .args(args)
            .env("PATH", path)
            .envs(environment.iter().copied()),
        &format!("{program} installer"),
    )?;
    if !available(program)? {
        return Err(anyhow!(
            "{program} installer completed but executable is not on PATH"
        ));
    }
    Ok(())
}

pub(crate) fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    #[test]
    fn failed_download_preserves_destination_and_never_runs_partial_installer() {
        let root = tempfile::tempdir().unwrap();
        let curl = root.path().join("fake-curl");
        let marker = root.path().join("executed");
        // Produce a valid, dangerous installer fragment, then fail the download.
        std::fs::write(&curl, format!("#!/bin/sh\nwhile [ \\\"$1\\\" != --output ]; do shift; done\nprintf '%s\\n' {} > \\\"$2\\\"\nexit 22\n", quote(&format!("touch {}", quote(marker.to_str().unwrap())))).replace("\\\"", "\"")).unwrap();
        std::fs::set_permissions(&curl, std::fs::Permissions::from_mode(0o700)).unwrap();
        let destination = root.path().join("existing");
        std::fs::write(&destination, "preserved").unwrap();
        assert!(download_with(&curl, "https://fixture.invalid", &destination).is_err());
        assert_eq!(std::fs::read_to_string(&destination).unwrap(), "preserved");
        assert!(install_with(
            &curl,
            "fluentci-missing-bootstrap-fixture",
            "https://fixture.invalid",
            "/bin/sh",
            &[],
            &[]
        )
        .is_err());
        assert!(!marker.exists());
    }
    #[test]
    fn quoted_urls_are_single_shell_arguments() {
        let value = "https://example.test/a'b?x=$(touch ignored)&z=1";
        let output = Command::new("/bin/sh")
            .args(["-c", &format!("printf '%s' {}", quote(value))])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8(output.stdout).unwrap(), value);
    }
}
