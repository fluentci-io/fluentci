use super::Manifest;
use crate::{
    config::ModuleRuntime,
    modules::{LocalModule, ModuleSource},
};
use anyhow::{Context, Result, ensure};
use fluentci_engine::components::{
    composition::{self, DependencyInterface},
    module_dependencies,
};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub struct Prepared {
    pub runtime: Option<ModuleRuntime>,
    pub artifacts: BTreeMap<String, PathBuf>,
    pub interfaces: BTreeMap<String, (PathBuf, DependencyInterface)>,
}

pub async fn prepare(
    source: &Path,
    root: &Path,
    frozen: bool,
    stack: &mut Vec<PathBuf>,
) -> Result<Prepared> {
    let Some(manifest) = Manifest::read(source)? else {
        return Ok(Prepared::default());
    };
    crate::lockfile::ensure_declarations(root, frozen).await?;
    let source = source.canonicalize()?;
    ensure!(
        stack.len() < 64 && !stack.contains(&source),
        "Cyclic or excessively deep module dependencies: {}",
        source.display()
    );
    stack.push(source.clone());
    let result = prepare_inner(&source, root, frozen, stack, &manifest).await;
    stack.pop();
    result
}

async fn prepare_inner(
    source: &Path,
    root: &Path,
    frozen: bool,
    stack: &mut Vec<PathBuf>,
    manifest: &Manifest,
) -> Result<Prepared> {
    let mut prepared = Prepared {
        runtime: Some(manifest.module.runtime),
        ..Default::default()
    };
    let mut typescript = String::new();
    for (alias, dependency) in &manifest.dependencies {
        let definition = dependency.definition(alias)?;
        let local = LocalModule::resolve(&source.join(super::FILE), &definition)?;
        let artifact = match &local.source {
            ModuleSource::Path(_) => Box::pin(local.prepare_local(root, frozen, stack)).await?,
            ModuleSource::Git(_) => {
                let directory =
                    crate::lockfile::git_source(root, &definition, frozen, false).await?;
                let local = LocalModule::resolve(
                    &directory.join(super::FILE),
                    &crate::config::Module {
                        path: Some(".".into()),
                        git: None,
                        rev: None,
                        subdir: None,
                        ..definition
                    },
                )?;
                Box::pin(local.prepare_local(root, frozen, stack)).await?
            }
            ModuleSource::Registry(_) => Box::pin(local.prepare_with_lock(root, frozen)).await?,
            ModuleSource::Url(url) => {
                crate::lockfile::url_source(root, url.as_str(), frozen).await?
            }
        };
        let artifact = install_artifact(source, alias, dependency, &artifact)?;
        if manifest.module.runtime == ModuleRuntime::Component {
            let bytes = std::fs::read(&artifact)?;
            let interface = composition::interface(alias, &bytes)?;
            if manifest.module.sdk == crate::config::Sdk::Typescript {
                typescript.push_str(&composition::typescript(alias, &bytes)?);
            }
            prepared
                .interfaces
                .insert(alias.clone(), (artifact.clone(), interface));
        }
        prepared.artifacts.insert(alias.clone(), artifact);
    }
    let directory = source.join(".fluentci/dependencies");
    std::fs::create_dir_all(&directory)?;
    let interfaces = prepared
        .interfaces
        .values()
        .map(|(_, interface)| interface)
        .collect::<Vec<_>>();
    crate::modules::write_if_changed(
        &directory.join("interfaces.json"),
        &serde_json::to_vec_pretty(&interfaces)?,
    )?;
    let installed = source.join("fluentci_modules");
    std::fs::create_dir_all(&installed)?;
    crate::modules::write_if_changed(&installed.join("imports.d.ts"), typescript.as_bytes())?;
    Ok(prepared)
}

pub async fn finish(artifact: &Path, dependencies: &Prepared) -> Result<PathBuf> {
    if dependencies.artifacts.is_empty() {
        return Ok(artifact.to_owned());
    }
    let bytes = if dependencies.runtime == Some(ModuleRuntime::Component) {
        composition::compose(artifact, &dependencies.interfaces)?
    } else {
        let artifacts = dependencies
            .artifacts
            .iter()
            .map(|(alias, path)| Ok((alias.clone(), std::fs::read(path)?)))
            .collect::<Result<BTreeMap<_, _>>>()?;
        module_dependencies::embed(&std::fs::read(artifact)?, &artifacts)?
    };
    let hash = sha256::digest(&bytes);
    let directory = dirs::cache_dir()
        .context("No cache directory")?
        .join("fluentci/composed");
    tokio::fs::create_dir_all(&directory).await?;
    let output = directory.join(format!("{hash}.wasm"));
    crate::modules::write_if_changed(&output, &bytes)?;
    Ok(output)
}

pub(crate) fn install_artifact(
    source: &Path,
    alias: &str,
    dependency: &super::Dependency,
    artifact: &Path,
) -> Result<PathBuf> {
    crate::config::validate_module_name(alias)?;
    let bytes = std::fs::read(artifact)?;
    let digest = sha256::digest(&bytes);
    let directory = source.join("fluentci_modules").join(alias);
    std::fs::create_dir_all(&directory)?;
    let artifact = directory.join(format!("{digest}.wasm"));
    crate::modules::write_if_changed(&artifact, &bytes)?;
    crate::modules::write_if_changed(
        &directory.join("module.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"source":dependency,"artifact":format!("{digest}.wasm"),"sha256":digest}),
        )?,
    )?;
    super::ignore_install_directory(source)?;
    Ok(artifact)
}
