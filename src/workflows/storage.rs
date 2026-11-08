use super::{Definition, Update, Workflow};
use anyhow::{Context, Result, ensure};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

struct Stored {
    definition: Definition,
    path: PathBuf,
    revision: String,
}

fn directory(root: &Path, create: bool) -> Result<Option<PathBuf>> {
    if !root.is_dir() {
        ensure!(!create, "Project directory does not exist");
        return Ok(None);
    }
    let root = root.canonicalize()?;
    let mut directory = root.clone();
    for part in [".fluentci", "workflows"] {
        directory.push(part);
        if !directory.exists() {
            if !create {
                return Ok(None);
            }
            fs::create_dir(&directory)
                .with_context(|| format!("Creating {}", directory.display()))?;
        }
        directory = directory.canonicalize()?;
        ensure!(
            directory.starts_with(&root) && directory.is_dir(),
            "Workflow directory must stay inside the project root"
        );
    }
    Ok(Some(directory))
}

fn entries(root: &Path) -> Result<Vec<Stored>> {
    let Some(directory) = directory(root, false)? else {
        return Ok(vec![]);
    };
    let mut entries = vec![];
    let mut ids = HashSet::new();
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.extension().is_none_or(|ext| ext != "toml") {
            continue;
        }
        let info = fs::symlink_metadata(&path)?;
        ensure!(
            info.is_file() && !info.file_type().is_symlink(),
            "Workflow definitions must be regular files: {}",
            path.display()
        );
        ensure!(
            info.len() <= 1024 * 1024,
            "Workflow definition exceeds 1 MiB: {}",
            path.display()
        );
        let bytes = fs::read(&path)?;
        let definition: Definition = toml::from_str(std::str::from_utf8(&bytes)?)
            .with_context(|| format!("Invalid workflow {}", path.display()))?;
        definition
            .validate()
            .with_context(|| format!("Invalid workflow {}", path.display()))?;
        ensure!(
            ids.insert(definition.id.clone()),
            "Duplicate workflow ID {:?}",
            definition.id
        );
        let revision = sha256::digest(
            [
                path.file_name().unwrap().to_string_lossy().as_bytes(),
                bytes.as_slice(),
            ]
            .concat(),
        );
        entries.push(Stored {
            definition,
            path,
            revision,
        });
    }
    entries.sort_by(|a, b| a.definition.id.cmp(&b.definition.id));
    Ok(entries)
}

fn metadata(value: &Stored) -> Workflow {
    value.definition.metadata(
        Some(format!(
            ".fluentci/workflows/{}",
            value.path.file_name().unwrap().to_string_lossy()
        )),
        Some(value.revision.clone()),
    )
}

pub(super) fn list(root: &Path) -> Result<Vec<Workflow>> {
    Ok(entries(root)?.iter().map(metadata).collect())
}

pub(super) fn read(root: &Path, id: &str) -> Result<Option<Definition>> {
    Ok(entries(root)?
        .into_iter()
        .find(|entry| entry.definition.id == id)
        .map(|entry| entry.definition))
}

fn lock(root: &Path) -> Result<(PathBuf, crate::file_guard::FileGuard)> {
    let directory = directory(root, true)?.context("Missing workflow directory")?;
    let guard = crate::file_guard::FileGuard::lock(&directory.join(".lock"))?;
    Ok((directory, guard))
}

fn check_revision(current: Option<&Stored>, expected: Option<&str>) -> Result<()> {
    if let Some(expected) = expected {
        ensure!(
            if expected.is_empty() {
                current.is_none()
            } else {
                current.is_some_and(|entry| entry.revision == expected)
            },
            "Workflow changed on disk. Reload it before saving."
        );
    }
    Ok(())
}

fn persist(root: &Path, path: &Path, value: Definition, create: bool) -> Result<Workflow> {
    value.validate()?;
    let content = toml::to_string_pretty(&value)?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().context("Missing workflow directory")?)?;
    temporary.write_all(content.as_bytes())?;
    temporary.as_file().sync_all()?;
    if create {
        temporary
            .persist_noclobber(path)
            .context("Workflow file already exists")?;
    } else {
        temporary.persist(path)?;
    }
    entries(root)?
        .iter()
        .find(|entry| entry.definition.id == value.id)
        .map(metadata)
        .context("Workflow was not saved")
}

pub(super) fn write(
    root: &Path,
    value: Definition,
    create: bool,
    revision: Option<&str>,
) -> Result<Workflow> {
    value.validate()?;
    let (directory, _lock) = lock(root)?;
    let all = entries(root)?;
    let current = all.iter().find(|entry| entry.definition.id == value.id);
    ensure!(
        !create || current.is_none(),
        "Workflow ID {:?} already exists",
        value.id
    );
    check_revision(current, revision)?;
    let path = current
        .map(|entry| entry.path.clone())
        .unwrap_or_else(|| directory.join(format!("{}.toml", value.id)));
    persist(root, &path, value, create)
}

pub(super) fn update(root: &Path, fallback: Definition, update: Update) -> Result<Workflow> {
    let (directory, _lock) = lock(root)?;
    let all = entries(root)?;
    let current = all.iter().find(|entry| entry.definition.id == fallback.id);
    ensure!(
        current.is_some() || fallback.id == super::DEFAULT,
        "Workflow no longer exists"
    );
    check_revision(current, update.expected_revision.as_deref())?;
    let mut value = current
        .map(|entry| entry.definition.clone())
        .unwrap_or(fallback);
    if let Some(events) = update.events {
        value.events = events;
    }
    if let Some(name) = update.name {
        value.name = name.trim().into();
    }
    if let Some(description) = update.description {
        value.description = Some(description);
    }
    if let Some(enabled) = update.enabled {
        value.enabled = enabled;
    }
    if let Some(env) = update.env {
        value.env = env;
    }
    if let Some(actions) = update.actions {
        super::validate_actions(&actions)?;
        value.steps =
            Definition::from_actions(value.id.clone(), value.name.clone(), None, &actions).steps;
    }
    let path = current
        .map(|entry| entry.path.clone())
        .unwrap_or_else(|| directory.join(format!("{}.toml", value.id)));
    persist(root, &path, value, current.is_none())
}

pub(super) fn delete(root: &Path, id: &str, revision: Option<&str>) -> Result<bool> {
    let (_directory, _lock) = lock(root)?;
    let all = entries(root)?;
    let current = all
        .iter()
        .find(|entry| entry.definition.id == id)
        .context("Workflow not found")?;
    check_revision(Some(current), revision)?;
    fs::remove_file(&current.path)?;
    Ok(true)
}
