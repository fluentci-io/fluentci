//! Explicit native package tasks and child-local toolchain environments.
use crate::{cache, Plan};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Manager {
    Homebrew,
    Macports,
    Freebsd,
    Netbsd,
    Openbsd,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MacPortsBackend {
    #[default]
    Native,
    Rust,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Provider {
    pub manager: Manager,
    #[serde(default)]
    pub backend: MacPortsBackend,
    #[serde(default)]
    pub executable: Option<PathBuf>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Install {
    pub provider: Provider,
    pub packages: Vec<String>,
}
struct Resolved {
    prefix: PathBuf,
    executable: PathBuf,
    name: &'static str,
    args: Vec<String>,
}
impl Provider {
    fn resolve(&self, os: &str, arch: &str) -> Result<Resolved, String> {
        if self.manager != Manager::Macports && self.backend != MacPortsBackend::Native {
            return Err("backend is only configurable for MacPorts".into());
        }
        let (prefix, executable, name, args) = match (self.manager, os, arch) {
            (Manager::Homebrew, "macos", "aarch64") => (
                "/opt/homebrew",
                "/opt/homebrew/bin/brew",
                "brew",
                vec!["install", "--"],
            ),
            (Manager::Homebrew, "linux", "x86_64") => (
                "/home/linuxbrew/.linuxbrew",
                "/home/linuxbrew/.linuxbrew/bin/brew",
                "brew",
                vec!["install", "--"],
            ),
            (Manager::Macports, "macos", _) => (
                "/opt/local",
                if self.backend == MacPortsBackend::Rust {
                    "/usr/local/bin/port"
                } else {
                    "/opt/local/bin/port"
                },
                "port",
                vec!["-N", "install"],
            ),
            (Manager::Freebsd, "freebsd", _) => (
                "/usr/local",
                "/usr/local/sbin/pkg",
                "pkg",
                vec!["install", "-y"],
            ),
            (Manager::Netbsd, "netbsd", _) => (
                "/usr/pkg",
                "/usr/pkg/bin/pkgin",
                "pkgin",
                vec!["-y", "install"],
            ),
            (Manager::Openbsd, "openbsd", _) => {
                ("/usr/local", "/usr/sbin/pkg_add", "pkg_add", vec!["-I"])
            }
            _ => {
                return Err(format!(
                    "unsupported package manager {:?} on {os}/{arch}",
                    self.manager
                ))
            }
        };
        let executable = self.executable.clone().unwrap_or_else(|| executable.into());
        if !executable.is_absolute() {
            return Err("package manager executable must be absolute".into());
        }
        Ok(Resolved {
            prefix: prefix.into(),
            executable,
            name,
            args: args.into_iter().map(String::from).collect(),
        })
    }
}
impl Plan {
    pub(crate) fn has_package_tasks(&self) -> bool {
        self.tasks
            .iter()
            .any(|t| t.package_install.is_some() || !t.package_environment.is_empty())
    }
    pub(crate) fn resolve_packages(&self) -> Result<Self, String> {
        let mut plan = self.clone();
        for task in &mut plan.tasks {
            if let Some(install) = task.package_install.take() {
                if !task.program.is_empty()
                    || !task.args.is_empty()
                    || task.service.is_some()
                    || task.cache.is_some()
                    || !task.package_environment.is_empty()
                {
                    return Err("package_install is an explicit uncached task; do not combine it with a command, service, cache, or package_environment".into());
                }
                if install.packages.is_empty()
                    || install.packages.iter().any(|p| {
                        !p.starts_with(|c: char| c.is_ascii_alphanumeric())
                            || !p
                                .chars()
                                .all(|c| c.is_ascii_alphanumeric() || "@/._+-".contains(c))
                    })
                {
                    return Err("package_install requires valid package names, not options or shell fragments".into());
                }
                let resolved = install
                    .provider
                    .resolve(std::env::consts::OS, std::env::consts::ARCH)?;
                if !resolved.executable.is_file() {
                    return Err(format!(
                        "provision package manager explicitly at {}",
                        resolved.executable.display()
                    ));
                }
                task.program = resolved.executable.to_string_lossy().into_owned();
                task.args = resolved.args;
                task.args.extend(install.packages);
                task.resources.push(format!(
                    "package-prefix:{}",
                    cache::resolved_location(&resolved.prefix)?.display()
                ));
                task.package_environment.push(install.provider);
            }
            let mut seen = BTreeSet::new();
            for provider in task.package_environment.iter().rev() {
                if !seen.insert(provider.manager) {
                    return Err("duplicate package manager in package_environment".into());
                }
                let resolved = provider.resolve(std::env::consts::OS, std::env::consts::ARCH)?;
                if !resolved.executable.is_file() {
                    return Err(format!(
                        "provision package manager explicitly at {}",
                        resolved.executable.display()
                    ));
                }
                let key = format!(
                    "package-prefix:{}",
                    cache::resolved_location(&resolved.prefix)?.display()
                );
                let prefix = &resolved.prefix;
                if !task.resources.contains(&key) {
                    task.shared_resources.push(key);
                }
                let base = task
                    .env
                    .get("PATH")
                    .cloned()
                    .or_else(|| {
                        if self.inherit_env {
                            std::env::var("PATH").ok()
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| "/usr/bin:/bin:/usr/sbin:/sbin".into());
                task.env.insert(
                    "PATH".into(),
                    format!(
                        "{}/bin:{}/sbin:{}:{base}",
                        prefix.display(),
                        prefix.display(),
                        resolved.executable.parent().unwrap().display()
                    ),
                );
                if provider.manager == Manager::Homebrew {
                    task.env.insert("NONINTERACTIVE".into(), "1".into());
                    task.env.insert(
                        "HOMEBREW_PREFIX".into(),
                        prefix.to_string_lossy().into_owned(),
                    );
                }
                // Pin the selected port implementation even when both are installed.
                if task.program == resolved.name {
                    task.program = resolved.executable.to_string_lossy().into_owned();
                }
            }
            task.package_environment.clear();
        }
        Ok(plan)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn supported_platforms_and_backend_commands() {
        let brew = Provider {
            manager: Manager::Homebrew,
            backend: MacPortsBackend::Native,
            executable: None,
        };
        assert_eq!(
            brew.resolve("macos", "aarch64").unwrap().prefix,
            PathBuf::from("/opt/homebrew")
        );
        assert!(brew.resolve("linux", "x86_64").is_ok());
        assert!(brew.resolve("macos", "x86_64").is_err());
        assert!(brew.resolve("linux", "aarch64").is_err());
        let ports = Provider {
            manager: Manager::Macports,
            backend: MacPortsBackend::Rust,
            executable: None,
        };
        assert_eq!(
            ports.resolve("macos", "aarch64").unwrap().executable,
            PathBuf::from("/usr/local/bin/port")
        );
        assert!(ports.resolve("linux", "x86_64").is_err());
        for (manager, os, args) in [
            (Manager::Freebsd, "freebsd", vec!["install", "-y"]),
            (Manager::Netbsd, "netbsd", vec!["-y", "install"]),
            (Manager::Openbsd, "openbsd", vec!["-I"]),
        ] {
            let provider = Provider {
                manager,
                backend: MacPortsBackend::Native,
                executable: None,
            };
            assert_eq!(provider.resolve(os, "x86_64").unwrap().args, args);
            assert!(provider.resolve("linux", "x86_64").is_err());
        }
    }
}
