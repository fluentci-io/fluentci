//! Child processes use argument vectors, never interpolated shell commands.

use anyhow::{Context, Result, bail};
#[cfg(any(target_os = "openbsd", all(test, unix)))]
use std::{env, fs, io, os::unix::fs::PermissionsExt};
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::OnceLock,
};
use tokio::process::Command;

/// Resolve once before workers change directories. OpenBSD's argv sysctl can
/// return no executable even though Rust's startup arguments are still present.
pub fn current_exe() -> std::io::Result<PathBuf> {
    static EXECUTABLE: OnceLock<PathBuf> = OnceLock::new();
    if let Some(path) = EXECUTABLE.get() {
        return Ok(path.clone());
    }
    let executable = std::env::current_exe();
    #[cfg(target_os = "openbsd")]
    let executable = match executable {
        Ok(path) if path.is_absolute() => Ok(path),
        _ => resolve_executable(
            &env::args_os().next().unwrap_or_default(),
            env::var_os("PATH").as_deref(),
            &env::current_dir()?,
        ),
    };
    let executable = executable?;
    let _ = EXECUTABLE.set(executable.clone());
    Ok(executable)
}

#[cfg(any(target_os = "openbsd", all(test, unix)))]
fn resolve_executable(
    argv0: &OsStr,
    search_path: Option<&OsStr>,
    cwd: &Path,
) -> io::Result<PathBuf> {
    if argv0.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "Missing executable argument",
        ));
    }
    let path = Path::new(argv0);
    let candidates = if path.is_absolute() || path.components().count() > 1 {
        vec![cwd.join(path)]
    } else {
        env::split_paths(search_path.unwrap_or(OsStr::new("")))
            .map(|directory| cwd.join(directory).join(path))
            .collect()
    };
    for candidate in candidates {
        let Ok(metadata) = fs::metadata(&candidate) else {
            continue;
        };
        if metadata.permissions().mode() & 0o111 == 0 {
            continue;
        }
        if metadata.is_file() {
            return candidate.canonicalize();
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "Could not resolve executable from argv[0] and PATH",
    ))
}

pub async fn run(command: &mut Command) -> Result<()> {
    run_with_stdout(command, Stdio::inherit()).await
}

pub async fn run_build(command: &mut Command) -> Result<()> {
    run_with_stdout(command, Stdio::from(std::io::stderr())).await
}

async fn run_with_stdout(command: &mut Command, stdout: Stdio) -> Result<()> {
    command
        .stdin(Stdio::inherit())
        .stdout(stdout)
        .stderr(Stdio::inherit())
        .kill_on_drop(true);
    let description = format!("{command:?}");
    let mut child = command
        .spawn()
        .with_context(|| format!("Could not start {description}"))?;
    tokio::select! {
        status=child.wait()=> { let status=status?; if !status.success() { return Err(Failure {program:description,status}.into()); } }
        _=tokio::signal::ctrl_c()=> { child.kill().await?; bail!("Interrupted"); }
    }
    Ok(())
}

pub async fn execute<I, S>(program: &str, args: I, cwd: &Path) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run(Command::new(program).args(args).current_dir(cwd)).await
}

pub async fn execute_build<I, S>(program: &str, args: I, cwd: &Path) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_build(Command::new(program).args(args).current_dir(cwd)).await
}

#[derive(Debug)]
pub struct Failure {
    pub program: String,
    pub status: ExitStatus,
}

impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} exited with {}", self.program, self.status)
    }
}

impl std::error::Error for Failure {}

#[cfg(all(test, unix))]
mod tests {
    use super::resolve_executable;
    use std::{env, ffi::OsStr, fs, os::unix::fs::PermissionsExt};

    #[test]
    fn executable_lookup_handles_paths_and_rejects_nonexecutables() -> std::io::Result<()> {
        let directory = tempfile::tempdir()?;
        let cwd = directory.path().canonicalize()?;
        fs::create_dir(cwd.join("bin"))?;
        let binary = cwd.join("bin/fluentci");
        fs::write(&binary, b"fixture")?;
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755))?;
        for argument in [binary.as_os_str(), OsStr::new("./bin/fluentci")] {
            assert_eq!(resolve_executable(argument, None, &cwd)?, binary);
        }
        fs::create_dir(cwd.join("not-a-file"))?;
        fs::write(cwd.join("fluentci"), b"not executable")?;
        let paths = env::join_paths([cwd.clone(), cwd.join("bin")]).unwrap();
        assert_eq!(
            resolve_executable(OsStr::new("fluentci"), Some(&paths), &cwd)?,
            binary
        );
        assert_eq!(
            resolve_executable(OsStr::new("fluentci"), Some(OsStr::new("bin")), &cwd)?,
            binary
        );
        assert!(resolve_executable(OsStr::new("./fluentci"), Some(&paths), &cwd).is_err());
        assert!(resolve_executable(OsStr::new("./not-a-file"), Some(&paths), &cwd).is_err());
        assert!(resolve_executable(OsStr::new(""), Some(&paths), &cwd).is_err());
        assert!(resolve_executable(OsStr::new("absent"), Some(&paths), &cwd).is_err());
        Ok(())
    }
}
