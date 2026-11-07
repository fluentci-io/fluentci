//! Typed, side-effect-free primitive descriptions shared by native and Wasm SDKs.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Upload,
    Download,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Get,
    Put,
    List,
    Delete,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Algorithm {
    Sha256,
    Sha512,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "source",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Input {
    Text(String),
    File(PathBuf),
}

fn port() -> u16 {
    22
}

fn install() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ssh {
    pub host: String,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default = "port")]
    pub port: u16,
    #[serde(default)]
    pub identity: Option<PathBuf>,
    #[serde(default = "install")]
    pub install: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    Os,
    Arch,
    Digest {
        algorithm: Algorithm,
        input: Input,
    },
    Ssh {
        connection: Ssh,
        command: Vec<String>,
    },
    Scp {
        connection: Ssh,
        direction: Direction,
        source: String,
        destination: String,
    },
    Sftp {
        connection: Ssh,
        direction: Direction,
        source: String,
        destination: String,
    },
    Rsync {
        connection: Ssh,
        direction: Direction,
        source: String,
        destination: String,
    },
    Ftp {
        url: String,
        action: Action,
        #[serde(default)]
        path: Option<PathBuf>,
        #[serde(default)]
        username_env: Option<String>,
        #[serde(default)]
        password_env: Option<String>,
        #[serde(default = "install")]
        install: bool,
    },
    Ftps {
        url: String,
        action: Action,
        #[serde(default)]
        path: Option<PathBuf>,
        #[serde(default)]
        username_env: Option<String>,
        #[serde(default)]
        password_env: Option<String>,
        #[serde(default = "install")]
        install: bool,
    },
    S3 {
        bucket: String,
        key: String,
        action: Action,
        #[serde(default)]
        path: Option<PathBuf>,
        #[serde(default)]
        endpoint: Option<String>,
        #[serde(default)]
        region: Option<String>,
        #[serde(default = "install")]
        install: bool,
    },
}

impl Operation {
    pub fn is_pure(&self) -> bool {
        matches!(self, Self::Os | Self::Arch | Self::Digest { .. })
    }

    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::Ssh {
                connection,
                command,
            } => {
                validate_ssh(connection)?;
                if command.is_empty() || command.iter().any(|arg| arg.contains('\0')) {
                    return Err("SSH needs literal command arguments".into());
                }
            }
            Self::Scp {
                connection,
                source,
                destination,
                ..
            }
            | Self::Sftp {
                connection,
                source,
                destination,
                ..
            }
            | Self::Rsync {
                connection,
                source,
                destination,
                ..
            } => {
                validate_ssh(connection)?;
                for path in [source, destination] {
                    if path.is_empty() || path.contains(['\0', '\r', '\n']) {
                        return Err("invalid transfer path".into());
                    }
                }
            }
            Self::Ftp {
                url,
                action,
                path,
                username_env,
                password_env,
                ..
            }
            | Self::Ftps {
                url,
                action,
                path,
                username_env,
                password_env,
                ..
            } => {
                let parsed = url::Url::parse(url).map_err(|error| error.to_string())?;
                let secure = matches!(self, Self::Ftps { .. });
                if !(parsed.scheme() == "ftp" || secure && parsed.scheme() == "ftps")
                    || parsed.host_str().is_none()
                    || !parsed.username().is_empty()
                    || parsed.password().is_some()
                    || parsed.fragment().is_some()
                {
                    return Err("use an FTP/FTPS URL without credentials or fragments".into());
                }
                if matches!(action, Action::Get | Action::Put) && path.is_none() {
                    return Err("get/put require a local path".into());
                }
                if password_env.is_some() && username_env.is_none() {
                    return Err("password_env requires username_env".into());
                }
                for name in [username_env, password_env].into_iter().flatten() {
                    if name.is_empty() || name.contains(['=', '\0']) {
                        return Err("invalid credential environment variable".into());
                    }
                }
            }
            Self::S3 {
                bucket,
                key,
                action,
                path,
                endpoint,
                ..
            } => {
                if bucket.is_empty()
                    || bucket.starts_with('-')
                    || bucket.contains(['/', ':', '\0'])
                    || key.contains('\0')
                {
                    return Err("invalid S3 bucket/key".into());
                }
                if matches!(action, Action::Get | Action::Put) && path.is_none() {
                    return Err("get/put require a local path".into());
                }
                if let Some(endpoint) = endpoint {
                    let url = url::Url::parse(endpoint).map_err(|error| error.to_string())?;
                    if !matches!(url.scheme(), "http" | "https")
                        || url.host_str().is_none()
                        || !url.username().is_empty()
                        || url.password().is_some()
                    {
                        return Err("invalid S3 endpoint".into());
                    }
                }
            }
            Self::Digest {
                input: Input::File(path),
                ..
            } if path.as_os_str().is_empty() => {
                return Err("empty digest file path".into());
            }
            _ => {}
        }
        Ok(())
    }
}

fn validate_ssh(connection: &Ssh) -> Result<(), String> {
    if connection.host.is_empty()
        || connection.host.starts_with('-')
        || !connection.host.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b':' | b'[' | b']')
        })
        || connection.port == 0
    {
        return Err("invalid SSH host/port".into());
    }
    if connection.user.as_ref().is_some_and(|user| {
        user.is_empty()
            || !user
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    }) {
        return Err("invalid SSH user".into());
    }
    Ok(())
}
