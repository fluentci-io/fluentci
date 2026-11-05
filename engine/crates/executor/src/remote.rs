//! Composable host facts, digests, SSH and transfer operations.
//! Builders perform no IO. Execution uses the plan's environment and cancellation.

use crate::{Cancellation, Task};
pub use fluentci_primitives::*;
use sha2::{Digest, Sha256, Sha512};
use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
};

pub const PROGRAM: &str = "fluentci:primitive";

pub fn task(id: impl Into<String>, operation: Operation, cwd: impl Into<PathBuf>) -> Task {
    let mut task = crate::primitives::exec(id, "", vec![], cwd);
    task.primitive = Some(operation);
    task
}

pub fn parse(task: &Task) -> Result<Operation, String> {
    let operation = task
        .primitive
        .as_ref()
        .ok_or("missing primitive operation")?;
    operation.validate()?;
    Ok(operation.clone())
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn batch_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn local(value: &str) -> String {
    if Path::new(value).is_absolute() {
        value.into()
    } else {
        format!("./{value}")
    }
}

fn ftp_path(value: &str) -> Result<String, String> {
    let mut bytes = Vec::with_capacity(value.len());
    let mut remaining = value.as_bytes();
    while let Some((&first, rest)) = remaining.split_first() {
        if first == b'%' {
            if rest.len() < 2 {
                return Err("invalid encoded FTP path".into());
            }
            let decoded = hex::decode(&rest[..2]).map_err(|_| "invalid encoded FTP path")?;
            bytes.push(decoded[0]);
            remaining = &rest[2..];
        } else {
            bytes.push(first);
            remaining = rest;
        }
    }
    let path = String::from_utf8(bytes).map_err(|_| "FTP paths must be UTF-8")?;
    if path.contains(['\r', '\n', '\0']) {
        return Err("invalid FTP delete path".into());
    }
    Ok(path)
}

fn target(connection: &Ssh, bracket_ipv6: bool) -> String {
    let bare = connection
        .host
        .trim_start_matches('[')
        .trim_end_matches(']');
    let host = if bracket_ipv6 && bare.contains(':') {
        format!("[{bare}]")
    } else {
        bare.to_owned()
    };
    connection
        .user
        .as_ref()
        .map_or(host.clone(), |user| format!("{user}@{host}"))
}

fn ssh_options(connection: &Ssh, upper: bool) -> Vec<String> {
    let mut args = vec![
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=15".into(),
        if upper { "-P" } else { "-p" }.into(),
        connection.port.to_string(),
    ];
    if let Some(identity) = &connection.identity {
        args.extend(["-i".into(), identity.to_string_lossy().into_owned()]);
    }
    args
}

pub fn installation(os: &str, manager: &str, tool: &str) -> Result<Vec<String>, String> {
    let package = match tool {
        "ssh" | "scp" | "sftp" => match manager {
            "apt-get" => "openssh-client",
            "apk" => "openssh-client-default",
            "dnf" | "yum" => "openssh-clients",
            "pkg" => "openssh-portable",
            _ => "openssh",
        },
        "curl" => "curl",
        "rsync" => "rsync",
        "aws" => match manager {
            "pkgin" => "py*-awscli",
            _ => "awscli",
        },
        _ => return Err("unknown primitive tool".into()),
    };
    let args: &[&str] = match (os, manager) {
        ("macos", "brew") => &["install"],
        ("macos", "port") => &["-N", "install"],
        ("freebsd", "pkg") => &["install", "-y"],
        ("netbsd", "pkgin") => &["-y", "install"],
        ("openbsd", "pkg_add") => &["-I"],
        ("linux", "apt-get") => &["install", "-y"],
        ("linux", "dnf" | "yum") => &["install", "-y"],
        ("linux", "apk") => &["add", "--no-cache"],
        ("linux", "pacman") => &["-S", "--needed", "--noconfirm"],
        ("linux", "zypper") => &["--non-interactive", "install"],
        _ => return Err(format!("unsupported installer {manager} on {os}")),
    };
    Ok(std::iter::once(manager.to_owned())
        .chain(args.iter().map(|arg| (*arg).to_owned()))
        .chain(std::iter::once(package.into()))
        .collect())
}

fn executable(program: &str, env: &BTreeMap<OsString, OsString>) -> Option<PathBuf> {
    let path = env.get(OsStr::new("PATH")).cloned().unwrap_or_default();
    let mut dirs = std::env::split_paths(&path).collect::<Vec<_>>();
    dirs.extend(
        [
            "/usr/bin",
            "/bin",
            "/usr/local/bin",
            "/usr/local/sbin",
            "/opt/homebrew/bin",
            "/opt/local/bin",
        ]
        .iter()
        .map(PathBuf::from),
    );
    dirs.into_iter()
        .map(|directory| directory.join(program))
        .find(|path| {
            let Ok(metadata) = path.metadata() else {
                return false;
            };
            if !metadata.is_file() {
                return false;
            }
            // macOS can ship rsync 2.x. Prefer/provision a client that supports
            // protected remote arguments rather than passing unsafe shell paths.
            if program == "rsync" {
                let supported = Command::new(path)
                    .arg("--help")
                    .env_clear()
                    .envs(env)
                    .stdin(Stdio::null())
                    .stderr(Stdio::null())
                    .output()
                    .is_ok_and(|output| {
                        output.status.success() && {
                            let help = String::from_utf8_lossy(&output.stdout);
                            help.contains("--protect-args") || help.contains("--secluded-args")
                        }
                    });
                if !supported {
                    return false;
                }
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                metadata.permissions().mode() & 0o111 != 0
            }
            #[cfg(not(unix))]
            {
                true
            }
        })
}

fn run(
    argv: &[String],
    cwd: &Path,
    env: &BTreeMap<OsString, OsString>,
    stdout: &File,
    stderr: &File,
    cancel: &Cancellation,
) -> Result<(), String> {
    let program = argv.first().ok_or("empty primitive command")?;
    let mut command = Command::new(program);
    command
        .args(&argv[1..])
        .current_dir(cwd)
        .env_clear()
        .envs(env)
        .stdin(Stdio::null())
        .stdout(stdout.try_clone().map_err(|e| e.to_string())?)
        .stderr(stderr.try_clone().map_err(|e| e.to_string())?);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("starting {program}: {error}"))?;
    loop {
        if cancel.is_cancelled() {
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGTERM);
                }
            }
            thread::sleep(Duration::from_millis(100));
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
            }
            let _ = child.kill();
            let _ = child.wait();
            return Err("primitive cancelled".into());
        }
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(format!("{program} failed: {status}"))
                }
            }
            None => thread::sleep(Duration::from_millis(20)),
        }
    }
}

fn ensure(
    tool: &str,
    install: bool,
    cwd: &Path,
    env: &BTreeMap<OsString, OsString>,
    stdout: &File,
    stderr: &File,
    cancel: &Cancellation,
) -> Result<PathBuf, String> {
    if let Some(path) = executable(tool, env) {
        return Ok(path);
    }
    if !install {
        return Err(format!(
            "{tool} is not installed or lacks required capabilities; enable install or provision it explicitly"
        ));
    }
    let os = std::env::consts::OS;
    let managers: &[&str] = match os {
        "macos" => &["brew", "port"],
        "freebsd" => &["pkg"],
        "netbsd" => &["pkgin"],
        "openbsd" => &["pkg_add"],
        "linux" => &["apt-get", "dnf", "yum", "apk", "pacman", "zypper"],
        _ => &[],
    };
    let manager = managers
        .iter()
        .find(|manager| executable(manager, env).is_some())
        .ok_or_else(|| {
            format!("{tool} is missing and no supported package manager exists on {os}")
        })?;
    let mut argv = installation(os, manager, tool)?;
    argv[0] = executable(manager, env)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    #[cfg(unix)]
    if *manager != "brew" && unsafe { libc::geteuid() } != 0 {
        let sudo=executable("sudo",env).ok_or("tool installation needs root or sudo; provision the tool or disable automatic installation")?;
        argv.splice(
            0..0,
            [
                sudo.to_string_lossy().into_owned(),
                "-n".into(),
                "--".into(),
            ],
        );
    }
    if *manager == "apt-get" {
        let mut update = argv[..argv.len() - 3].to_vec();
        update.push("update".into());
        run(&update, cwd, env, stdout, stderr, cancel)?;
    }
    run(&argv, cwd, env, stdout, stderr, cancel)?;
    executable(tool, env)
        .ok_or_else(|| format!("installer completed but {tool} is still unavailable"))
}

pub fn execute(
    task: &Task,
    inherited: &BTreeMap<OsString, OsString>,
    mut stdout: File,
    stderr: File,
    cancel: &Cancellation,
) -> Result<(), String> {
    let operation = parse(task)?;
    let mut env = inherited.clone();
    env.insert("AWS_PAGER".into(), "".into());
    env.extend(
        task.env
            .iter()
            .map(|(key, value)| (key.into(), value.into())),
    );
    let mut temporary: Vec<tempfile::NamedTempFile> = vec![];
    let (tool, install, mut args) = match operation {
        Operation::Os => {
            writeln!(stdout, "{}", std::env::consts::OS).map_err(|e| e.to_string())?;
            return Ok(());
        }
        Operation::Arch => {
            writeln!(stdout, "{}", std::env::consts::ARCH).map_err(|e| e.to_string())?;
            return Ok(());
        }
        Operation::Digest { algorithm, input } => {
            let mut input: Box<dyn Read> = match input {
                Input::Text(value) => Box::new(std::io::Cursor::new(value.into_bytes())),
                Input::File(path) => {
                    Box::new(File::open(task.cwd.join(path)).map_err(|e| e.to_string())?)
                }
            };
            let mut sha256 = Sha256::new();
            let mut sha512 = Sha512::new();
            let mut bytes = [0; 65536];
            loop {
                if cancel.is_cancelled() {
                    return Err("digest cancelled".into());
                }
                let count = input.read(&mut bytes).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                match algorithm {
                    Algorithm::Sha256 => sha256.update(&bytes[..count]),
                    Algorithm::Sha512 => sha512.update(&bytes[..count]),
                }
            }
            let digest = match algorithm {
                Algorithm::Sha256 => hex::encode(sha256.finalize()),
                Algorithm::Sha512 => hex::encode(sha512.finalize()),
            };
            writeln!(stdout, "{digest}").map_err(|e| e.to_string())?;
            return Ok(());
        }
        Operation::Ssh {
            connection,
            command,
        } => {
            let mut args = ssh_options(&connection, false);
            args.extend([
                "--".into(),
                target(&connection, false),
                command
                    .iter()
                    .map(|arg| quote(arg))
                    .collect::<Vec<_>>()
                    .join(" "),
            ]);
            ("ssh", connection.install, args)
        }
        Operation::Scp {
            connection,
            direction,
            source,
            destination,
        } => {
            let mut args = ssh_options(&connection, true);
            args.push("--".into());
            let (remote, local_path) = match direction {
                Direction::Upload => (
                    format!("{}:{destination}", target(&connection, true)),
                    local(&source),
                ),
                Direction::Download => (
                    format!("{}:{source}", target(&connection, true)),
                    local(&destination),
                ),
            };
            match direction {
                Direction::Upload => args.extend([local_path, remote]),
                Direction::Download => args.extend([remote, local_path]),
            }
            ("scp", connection.install, args)
        }
        Operation::Sftp {
            connection,
            direction,
            source,
            destination,
        } => {
            let mut batch = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
            let method = match direction {
                Direction::Upload => "put",
                Direction::Download => "get",
            };
            writeln!(
                batch,
                "{method} {} {}",
                batch_quote(&source),
                batch_quote(&destination)
            )
            .map_err(|e| e.to_string())?;
            let mut args = ssh_options(&connection, true);
            args.extend([
                "-b".into(),
                batch.path().to_string_lossy().into_owned(),
                "--".into(),
                target(&connection, true),
            ]);
            temporary.push(batch);
            ("sftp", connection.install, args)
        }
        Operation::Rsync {
            connection,
            direction,
            source,
            destination,
        } => {
            let remote_shell = std::iter::once("ssh".to_owned())
                .chain(ssh_options(&connection, false))
                .map(|arg| quote(&arg))
                .collect::<Vec<_>>()
                .join(" ");
            let mut args = vec![
                "-a".into(),
                "--protect-args".into(),
                "-e".into(),
                remote_shell,
                "--".into(),
            ];
            match direction {
                Direction::Upload => args.extend([
                    local(&source),
                    format!("{}:{destination}", target(&connection, true)),
                ]),
                Direction::Download => args.extend([
                    format!("{}:{source}", target(&connection, true)),
                    local(&destination),
                ]),
            }
            ("rsync", connection.install, args)
        }
        Operation::Ftp {
            ref url,
            ref action,
            ref path,
            ref username_env,
            ref password_env,
            install,
        }
        | Operation::Ftps {
            ref url,
            ref action,
            ref path,
            ref username_env,
            ref password_env,
            install,
        } => {
            let mut transfer_url = url.clone();
            let mut args = vec![
                "--fail".into(),
                "--show-error".into(),
                "--silent".into(),
                "--connect-timeout".into(),
                "15".into(),
            ];
            if matches!(operation, Operation::Ftps { .. }) {
                args.push("--ssl-reqd".into());
            }
            if let Some(username_env) = username_env {
                let username = env
                    .get(OsStr::new(username_env))
                    .ok_or("missing FTP username environment variable")?
                    .to_string_lossy();
                let password = if let Some(name) = password_env {
                    env.get(OsStr::new(name))
                        .ok_or("missing FTP password environment variable")?
                        .to_string_lossy()
                        .into_owned()
                } else {
                    String::new()
                };
                if username.contains(['\n', '\r']) || password.contains(['\n', '\r']) {
                    return Err("FTP credentials cannot contain newlines".into());
                }
                let mut config = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
                writeln!(
                    config,
                    "user = {}",
                    batch_quote(&format!("{username}:{password}"))
                )
                .map_err(|e| e.to_string())?;
                args.extend([
                    "--config".into(),
                    config.path().to_string_lossy().into_owned(),
                ]);
                temporary.push(config);
            }
            match action {
                Action::Get => args.extend([
                    "--output".into(),
                    task.cwd
                        .join(path.as_ref().unwrap())
                        .to_string_lossy()
                        .into_owned(),
                ]),
                Action::Put => args.extend([
                    "--ftp-create-dirs".into(),
                    "--upload-file".into(),
                    task.cwd
                        .join(path.as_ref().unwrap())
                        .to_string_lossy()
                        .into_owned(),
                ]),
                Action::List => args.push("--list-only".into()),
                Action::Delete => {
                    let mut parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
                    let path = ftp_path(parsed.path())?;
                    args.extend(["--quote".into(), format!("DELE {path}"), "--head".into()]);
                    parsed.set_path("/");
                    parsed.set_query(None);
                    transfer_url = parsed.into();
                }
            }
            args.extend(["--url".into(), transfer_url]);
            ("curl", install, args)
        }
        Operation::S3 {
            bucket,
            key,
            action,
            path,
            endpoint,
            region,
            install,
        } => {
            let mut args = vec![];
            if let Some(endpoint) = endpoint {
                args.extend(["--endpoint-url".into(), endpoint]);
            }
            if let Some(region) = region {
                args.extend(["--region".into(), region]);
            }
            args.push("s3".into());
            let object = format!("s3://{bucket}/{key}");
            match action {
                Action::List => args.extend(["ls".into(), object]),
                Action::Delete => args.extend(["rm".into(), object]),
                Action::Get => args.extend([
                    "cp".into(),
                    object,
                    task.cwd.join(path.unwrap()).to_string_lossy().into_owned(),
                ]),
                Action::Put => args.extend([
                    "cp".into(),
                    task.cwd.join(path.unwrap()).to_string_lossy().into_owned(),
                    object,
                ]),
            }
            ("aws", install, args)
        }
    };
    if tool == "rsync" {
        let ssh = ensure("ssh", install, &task.cwd, &env, &stdout, &stderr, cancel)?;
        if let Some(index) = args.iter().position(|arg| arg == "-e") {
            args[index + 1] = args[index + 1].replacen("'ssh'", &quote(&ssh.to_string_lossy()), 1);
        }
    }
    let executable = ensure(tool, install, &task.cwd, &env, &stdout, &stderr, cancel)?;
    args.insert(0, executable.to_string_lossy().into_owned());
    run(&args, &task.cwd, &env, &stdout, &stderr, cancel)
}
