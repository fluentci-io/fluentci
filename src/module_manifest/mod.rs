//! Module-owned metadata and reproducible dependency declarations.

mod add;
pub(crate) mod dependencies;
mod model;
pub use add::add;

pub use dependencies::prepare;
pub use model::{Dependency, Manifest};

pub const FILE: &str = "fluentci-module.toml";

/// Collect source-level declarations without builds, downloads or executing code.
pub fn declarations(
    root: &std::path::Path,
) -> anyhow::Result<Vec<(String, crate::config::Module)>> {
    let canonical_root = root.canonicalize()?;
    let root = canonical_root.as_path();
    fn visit(
        root: &std::path::Path,
        source: &std::path::Path,
        stack: &mut Vec<std::path::PathBuf>,
        seen: &mut std::collections::BTreeSet<std::path::PathBuf>,
        result: &mut Vec<(String, crate::config::Module)>,
    ) -> anyhow::Result<()> {
        let Some(manifest) = Manifest::read(source)? else {
            return Ok(());
        };
        let source = source.canonicalize()?;
        anyhow::ensure!(
            !stack.contains(&source) && stack.len() < 64,
            "Cyclic or excessively deep module dependency graph at {}",
            source.display()
        );
        if !seen.insert(source.clone()) {
            return Ok(());
        }
        stack.push(source.clone());
        for (alias, dependency) in manifest.dependencies {
            let mut definition = dependency.definition(&alias)?;
            let key = format!(
                "dependency:{}:{alias}",
                crate::workspace::relative_path(root, &source).display()
            );
            if let Some(path) = &definition.path {
                let path = source.join(path);
                let directory = if path.is_dir() {
                    path.clone()
                } else {
                    path.parent().unwrap_or(&path).to_owned()
                };
                if path.is_dir() || path.file_name().is_some_and(|name| name == "Cargo.toml") {
                    visit(root, &directory, stack, seen, result)?;
                }
                definition.path = Some(crate::workspace::relative_path(root, &path));
            }
            result.push((key, definition));
        }
        stack.pop();
        Ok(())
    }
    let mut result = vec![];
    let mut stack = vec![];
    let mut seen = std::collections::BTreeSet::new();
    visit(root, root, &mut stack, &mut seen, &mut result)?;
    if let Some(path) = crate::config::find(root) {
        for module in crate::config::Config::read(&path)?.modules {
            if let Some(source) = module.path {
                let source = path.parent().unwrap_or(root).join(source);
                let directory = if source.is_dir() {
                    source.clone()
                } else {
                    source.parent().unwrap_or(&source).to_owned()
                };
                visit(root, &directory, &mut stack, &mut seen, &mut result)?;
            }
        }
    }
    Ok(result)
}

pub fn ignore_install_directory(root: &std::path::Path) -> anyhow::Result<()> {
    let path = root.join(".gitignore");
    let mut source = match std::fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    for pattern in [
        "/fluentci_modules/",
        "/.fluentci/dependencies/",
        "/.fluentci/dependencies.add.guard",
        "/fluentci.lock.guard",
    ] {
        if !source
            .lines()
            .any(|line| line.trim() == pattern || line.trim() == pattern.trim_start_matches('/'))
        {
            if !source.is_empty() && !source.ends_with('\n') {
                source.push('\n');
            }
            source.push_str(pattern);
            source.push('\n');
        }
    }
    crate::modules::write_if_changed(&path, source.as_bytes())
}
