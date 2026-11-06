//! Reproducible registry dependencies shared by CLI runs and declared modules.

use crate::{config, registry, workspace::Workspace};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Lockfile {
    lockfile_version: u32,
    #[serde(default)]
    modules: BTreeMap<String, String>,
    #[serde(default)]
    packages: BTreeMap<String, LockedPackage>,
    #[serde(default)]
    git: BTreeMap<String, LockedGit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LockedPackage {
    registry: String,
    name: String,
    version: String,
    author: String,
    url: String,
    sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    repository: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    subdir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    readme_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    topics: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    os: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    arch: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LockedGit {
    url: String,
    revision: String,
    commit: String,
}

fn git_key(module: &config::Module) -> String {
    format!(
        "git:{}#{}",
        module.git.as_deref().unwrap_or_default(),
        module.rev.as_deref().unwrap_or("HEAD")
    )
}

fn key(reference: &str) -> Result<String> {
    let parsed = registry::package_reference(reference)?;
    let prefix = if parsed.author.is_empty() {
        parsed.name.to_owned()
    } else {
        format!("@{}/{}", parsed.author, parsed.name)
    };
    Ok(format!("{prefix}@{}", parsed.version))
}

fn declarations(root: &Path) -> Result<BTreeMap<String, String>> {
    let config = config::find(root)
        .map(|path| config::Config::read(&path))
        .transpose()?;
    config
        .into_iter()
        .flat_map(|config| config.modules)
        .filter_map(|module| {
            if module.git.is_some() {
                Some(Ok((
                    module.name.clone(),
                    format!(
                        "{}:{}",
                        git_key(&module),
                        module.subdir.as_deref().unwrap_or(Path::new(".")).display()
                    ),
                )))
            } else {
                module.registry_package().map(|reference| {
                    key(reference).map(|reference| (module.name.clone(), reference))
                })
            }
        })
        .collect()
}

async fn guard(root: &Path) -> Result<File> {
    let path = root.join("fluentci.lock.guard");
    tokio::task::spawn_blocking(move || {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)?;
        file.lock()?;
        Ok(file)
    })
    .await?
}

fn read(root: &Path) -> Result<Lockfile> {
    let path = root.join("fluentci.lock");
    let lock = match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).context("Invalid fluentci.lock")?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Lockfile {
            lockfile_version: 1,
            ..Default::default()
        },
        Err(error) => return Err(error.into()),
    };
    anyhow::ensure!(
        lock.lockfile_version == 1,
        "Unsupported fluentci.lock version"
    );
    Ok(lock)
}

fn write(root: &Path, lock: &Lockfile) -> Result<()> {
    let mut bytes = serde_json::to_vec_pretty(lock)?;
    bytes.push(b'\n');
    if std::fs::read(root.join("fluentci.lock")).ok().as_deref() == Some(bytes.as_slice()) {
        return Ok(());
    }
    let mut file = tempfile::NamedTempFile::new_in(root)?;
    file.write_all(&bytes)?;
    file.as_file().sync_all()?;
    file.persist(root.join("fluentci.lock"))?;
    Ok(())
}

impl LockedPackage {
    fn from_resolved(package: &registry::Resolved) -> Result<Self> {
        let metadata = &package.metadata;
        Ok(Self {
            registry: registry::base_url(),
            name: metadata
                .name
                .clone()
                .context("Registry returned no package name")?,
            version: package.version.clone(),
            author: metadata
                .author
                .clone()
                .context("Registry returned no publisher DID")?,
            url: metadata
                .url
                .clone()
                .context("Registry returned no Wasm URL")?,
            sha256: metadata
                .sha256
                .clone()
                .context("Registry returned no Wasm checksum")?,
            uri: metadata.uri.clone(),
            cid: metadata.cid.clone(),
            readme_url: metadata.readme_url.clone(),
            topics: metadata.topics.clone(),
            os: metadata.os.clone(),
            arch: metadata.arch.clone(),
            repository: metadata.repository.clone(),
            subdir: metadata.subdir.clone(),
        })
    }

    fn resolved(&self, reference: &str) -> Result<registry::Resolved> {
        let parsed = registry::package_reference(reference)?;
        anyhow::ensure!(
            self.registry == registry::base_url(),
            "Registry changed; run fluentci update"
        );
        anyhow::ensure!(
            self.name == parsed.name
                && (parsed.version == "latest" || parsed.version == self.version),
            "Lock entry does not match {reference}"
        );
        semver::Version::parse(&self.version).context("Invalid locked module version")?;
        anyhow::ensure!(
            self.author.starts_with("did:")
                && self.sha256.len() == 64
                && self.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid locked publisher or checksum"
        );
        crate::publishing::wasm_url(&self.url)?;
        Ok(registry::Resolved {
            name: reference.into(),
            version: self.version.clone(),
            metadata: registry::Package {
                name: Some(self.name.clone()),
                version: Some(self.version.clone()),
                author: Some(self.author.clone()),
                url: Some(self.url.clone()),
                sha256: Some(self.sha256.clone()),
                uri: self.uri.clone(),
                cid: self.cid.clone(),
                readme_url: self.readme_url.clone(),
                topics: self.topics.clone(),
                os: self.os.clone(),
                arch: self.arch.clone(),
                repository: self.repository.clone(),
                subdir: self.subdir.clone(),
                ..Default::default()
            },
        })
    }
}

pub async fn resolve(root: &Path, reference: &str, frozen: bool) -> Result<registry::Resolved> {
    let _guard = guard(root).await?;
    let mut lock = read(root)?;
    let modules = declarations(root)?;
    if frozen {
        anyhow::ensure!(
            root.join("fluentci.lock").is_file() && modules == lock.modules,
            "fluentci.lock is missing or out of date; run fluentci install"
        );
    }
    let key = key(reference)?;
    if let Some(package) = lock.packages.get(&key) {
        let resolved = package.resolved(reference)?;
        if !frozen {
            lock.modules = modules;
            write(root, &lock)?;
        }
        return Ok(resolved);
    }
    anyhow::ensure!(
        !frozen,
        "{reference} is missing from fluentci.lock; run fluentci install"
    );
    let package = registry::resolve(reference).await?;
    // Preserve legacy TypeScript registry behavior; only Wasm packages are locked.
    if package.metadata.url.is_some() {
        let entry = LockedPackage::from_resolved(&package)?;
        entry.resolved(reference)?;
        lock.packages.insert(key, entry);
        lock.modules = modules;
        write(root, &lock)?;
    }
    Ok(package)
}

pub async fn install(frozen: bool, update: bool, selected: Option<&str>) -> Result<()> {
    let workspace = Workspace::current()?;
    let root = &workspace.root;
    let modules = declarations(root)?;
    let config = config::find(root)
        .map(|path| config::Config::read(&path))
        .transpose()?;
    let git_modules = config
        .as_ref()
        .map(|config| {
            config
                .modules
                .iter()
                .filter(|module| {
                    module.git.is_some() && selected.is_none_or(|name| name == module.name)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let selected_git = !git_modules.is_empty();
    for module in git_modules {
        git_source(root, module, frozen, update).await?;
    }
    let mut references: Vec<String> = modules
        .iter()
        .filter(|(name, _)| selected.is_none_or(|selected| name.as_str() == selected))
        .filter(|(_, reference)| !reference.starts_with("git:"))
        .map(|(_, reference)| reference.clone())
        .collect();
    if let Some(selected) = selected
        && references.is_empty()
        && !selected_git
    {
        references.push(key(selected)?);
    }
    let _guard = guard(root).await?;
    let mut lock = read(root)?;
    if frozen {
        anyhow::ensure!(
            root.join("fluentci.lock").is_file() && modules == lock.modules,
            "fluentci.lock is missing or out of date; run fluentci install"
        );
    }
    references.sort();
    references.dedup();
    if update && selected.is_none() {
        references.extend(
            lock.packages
                .keys()
                .filter(|reference| !references.contains(reference))
                .cloned()
                .collect::<Vec<_>>(),
        );
    }
    for reference in references {
        let package = if !update && let Some(entry) = lock.packages.get(&reference) {
            entry.resolved(&reference)?
        } else {
            anyhow::ensure!(
                !frozen,
                "{reference} is missing from fluentci.lock; run fluentci install"
            );
            let package = registry::resolve(&reference).await?;
            let entry = LockedPackage::from_resolved(&package)?;
            entry.resolved(&reference)?;
            lock.packages.insert(reference.clone(), entry);
            package
        };
        registry::wasm_artifact(&package).await?;
        println!("{}@{}", package.name, package.version);
    }
    if !frozen {
        lock.modules = modules;
        write(root, &lock)?;
    }
    Ok(())
}

pub async fn git_source(
    root: &Path,
    module: &config::Module,
    frozen: bool,
    update: bool,
) -> Result<PathBuf> {
    let url = module.git.as_deref().context("Missing Git source URL")?;
    config::validate_repository(url)?;
    let _guard = guard(root).await?;
    let mut lock = read(root)?;
    let modules = declarations(root)?;
    if frozen {
        anyhow::ensure!(
            root.join("fluentci.lock").is_file() && modules == lock.modules,
            "fluentci.lock is missing or out of date; run fluentci install"
        );
    }
    let key = git_key(module);
    let entry = lock.git.get(&key).filter(|_| !update);
    let revision = module.rev.as_deref().unwrap_or("HEAD");
    let revision = if let Some(entry) = entry {
        anyhow::ensure!(
            entry.url == url
                && entry.revision == revision
                && matches!(entry.commit.len(), 40 | 64)
                && entry.commit.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid locked Git source"
        );
        entry.commit.as_str()
    } else {
        anyhow::ensure!(
            !frozen,
            "Git source is missing from fluentci.lock; run fluentci install"
        );
        revision
    };
    let (commit, checkout) = crate::git_source::checkout(url, revision).await?;
    let source = crate::git_source::subdirectory(&checkout, module.subdir.as_deref())?;
    if !frozen {
        lock.git.insert(
            key,
            LockedGit {
                url: url.into(),
                revision: module.rev.clone().unwrap_or_else(|| "HEAD".into()),
                commit,
            },
        );
        lock.modules = modules;
        write(root, &lock)?;
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn frozen_resolution_uses_the_lock_without_a_registry_request() -> Result<()> {
        let root = tempfile::tempdir()?;
        let reference = "@alice.example/cache@latest";
        let entry = LockedPackage {
            registry: registry::base_url(),
            name: "cache".into(),
            version: "1.2.3".into(),
            author: "did:plc:example".into(),
            url: "https://example.com/cache.wasm".into(),
            sha256: "a".repeat(64),
            uri: None,
            cid: None,
            repository: None,
            subdir: None,
            readme_url: Some("https://example.com/README.md".into()),
            topics: Some(vec!["cache".into()]),
            os: Some(vec!["linux".into()]),
            arch: Some(vec!["aarch64".into()]),
        };
        let mut lock = Lockfile {
            lockfile_version: 1,
            ..Default::default()
        };
        lock.packages.insert(key(reference)?, entry);
        write(root.path(), &lock)?;
        let before = std::fs::read(root.path().join("fluentci.lock"))?;
        let resolved = resolve(root.path(), reference, true).await?;
        assert_eq!(
            resolved.metadata.readme_url.as_deref(),
            Some("https://example.com/README.md")
        );
        assert_eq!(resolved.metadata.topics, Some(vec!["cache".into()]));
        assert_eq!(resolved.metadata.os, Some(vec!["linux".into()]));
        assert_eq!(resolved.metadata.arch, Some(vec!["aarch64".into()]));
        assert_eq!(
            resolve(root.path(), reference, true).await?.version,
            "1.2.3"
        );
        assert_eq!(std::fs::read(root.path().join("fluentci.lock"))?, before);
        assert!(
            resolve(root.path(), "@alice.example/other", true)
                .await
                .is_err()
        );
        std::fs::write(
            root.path().join("fluentci.toml"),
            "[[modules]]\nname='cache'\npackage='@alice.example/cache'\n",
        )?;
        assert!(resolve(root.path(), reference, true).await.is_err());
        Ok(())
    }

    #[test]
    fn canonical_keys_and_exact_versions_are_checked() -> Result<()> {
        assert_eq!(
            key("@alice.example/cache")?,
            key("@alice.example/cache@latest")?
        );
        assert_eq!(
            key("@alice.example/cache@v1.0.0")?,
            key("@alice.example/cache@1.0.0")?
        );
        Ok(())
    }
}
