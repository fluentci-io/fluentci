use super::{Dependency, Manifest};
use crate::{cli::AddArgs, config, modules, registry};
use anyhow::{Context, Result, ensure};
use std::{fs::OpenOptions, path::Path};

pub async fn add(root: &Path, options: &AddArgs) -> Result<()> {
    let root = root.canonicalize()?;
    ensure!(
        root.join(super::FILE).is_file(),
        "Run fluentci add at a module root containing fluentci-module.toml"
    );
    let (alias, dependency) = declaration(&root, options)?;
    dependency.definition(&alias)?;
    super::ignore_install_directory(&root)?;
    let directory = root.join(".fluentci");
    std::fs::create_dir_all(&directory)?;
    let guard_path = directory.join("dependencies.add.guard");
    let _guard = tokio::task::spawn_blocking(move || -> Result<_> {
        let guard = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(guard_path)?;
        guard.lock()?;
        Ok(guard)
    })
    .await??;
    let path = root.join(super::FILE);
    let original = std::fs::read_to_string(&path)?;
    let mut document: toml_edit::DocumentMut = original.parse()?;
    let value = match &dependency {
        Dependency::Package(package) => toml_edit::value(package),
        Dependency::Source(source) => {
            let mut table = toml_edit::InlineTable::new();
            for (key, value) in source {
                let encoded = format!("value = {}", value);
                let parsed: toml_edit::DocumentMut = encoded.parse()?;
                table.insert(
                    key,
                    parsed["value"]
                        .as_value()
                        .context("Invalid dependency field")?
                        .clone(),
                );
            }
            toml_edit::Item::Value(toml_edit::Value::InlineTable(table))
        }
    };
    if document.get("dependencies").is_none() {
        document["dependencies"] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    document["dependencies"][&alias] = value;
    let candidate = document.to_string();
    Manifest::parse(&candidate)?;
    modules::write_if_changed(&path, candidate.as_bytes())?;
    if let Err(error) = crate::lockfile::install_at(&root, false, false, None).await {
        if std::fs::read_to_string(&path)? == candidate {
            modules::write_if_changed(&path, original.as_bytes())?;
        }
        crate::lockfile::ensure_declarations(&root, false).await?;
        return Err(error).context("Installing module dependency failed");
    }
    super::ignore_install_directory(&root)?;
    println!("Added {alias} to {}", path.display());
    Ok(())
}

fn declaration(root: &Path, options: &AddArgs) -> Result<(String, Dependency)> {
    let mut source = toml::Table::new();
    let dependency = if let Some(path) = &options.path {
        source.insert("path".into(), path.to_string_lossy().to_string().into());
        Dependency::Source(source)
    } else if let Some(url) = &options.url {
        config::validate_module_url(url)?;
        source.insert("url".into(), url.clone().into());
        Dependency::Source(source)
    } else if let Some(git) = &options.git {
        source.insert("git".into(), git.clone().into());
        if let Some(rev) = &options.rev {
            source.insert("rev".into(), rev.clone().into());
        }
        if let Some(subdir) = &options.subdir {
            source.insert("subdir".into(), subdir.to_string_lossy().to_string().into());
        }
        Dependency::Source(source)
    } else if options.module.starts_with("http://") || options.module.starts_with("https://") {
        config::validate_module_url(&options.module)?;
        source.insert("url".into(), options.module.clone().into());
        Dependency::Source(source)
    } else if options.module.starts_with('.') || Path::new(&options.module).is_absolute() {
        source.insert("path".into(), options.module.clone().into());
        Dependency::Source(source)
    } else {
        registry::package_reference(&options.module)?;
        Dependency::Package(options.module.clone())
    };
    let alias = if let Some(alias) = &options.alias {
        alias.clone()
    } else if options.path.is_some() || options.url.is_some() || options.git.is_some() {
        options.module.clone()
    } else {
        match &dependency {
            Dependency::Package(reference) => registry::package_reference(reference)?.name.into(),
            Dependency::Source(source) => {
                if let Some(path) = source.get("path").and_then(toml::Value::as_str) {
                    let path = root.join(path);
                    Manifest::read(&path)?
                        .map(|manifest| manifest.module.name)
                        .or_else(|| {
                            path.file_stem()
                                .map(|name| name.to_string_lossy().to_string())
                        })
                        .context("Specify --alias for this path")?
                } else {
                    let url = reqwest::Url::parse(source["url"].as_str().context("Missing URL")?)?;
                    Path::new(url.path())
                        .file_stem()
                        .context("Specify --alias for this URL")?
                        .to_string_lossy()
                        .to_string()
                }
            }
        }
    };
    config::validate_module_name(&alias)?;
    Ok((alias, dependency))
}
