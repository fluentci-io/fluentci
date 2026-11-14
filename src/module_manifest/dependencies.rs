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
    // Fetch independent remote dependencies concurrently. Local source builds
    // remain in dependency order, preserving cycle detection and compiler safety.
    let tasks = manifest
        .dependencies
        .iter()
        .map(
            |(alias, dependency)| -> futures_util::future::BoxFuture<'_, Result<_>> {
                Box::pin(async move {
                    let definition = dependency.definition(alias)?;
                    let local = LocalModule::resolve(&source.join(super::FILE), &definition)?;
                    let path = match &local.source {
                        ModuleSource::Registry(reference) => {
                            let package =
                                crate::plugin_metadata::resolve(root, reference, frozen).await?;
                            Some(crate::plugin_metadata::prepare_package(&package).await?)
                        }
                        ModuleSource::Url(url) => {
                            Some(crate::lockfile::url_source(root, url.as_str(), frozen).await?)
                        }
                        ModuleSource::Git(_) => Some(
                            crate::lockfile::git_source(root, &definition, frozen, false).await?,
                        ),
                        ModuleSource::Path(_) => None,
                    };
                    Ok((alias.clone(), path))
                })
            },
        )
        .collect::<Vec<_>>();
    let remote = crate::dependency_cache::parallel(tasks)
        .await?
        .into_iter()
        .collect::<BTreeMap<_, _>>();
    let mut typescript = String::new();
    let mut pipeline_sources = BTreeMap::new();
    for (alias, dependency) in &manifest.dependencies {
        let definition = dependency.definition(alias)?;
        let local = LocalModule::resolve(&source.join(super::FILE), &definition)?;
        let artifact = match &local.source {
            ModuleSource::Path(_) => Box::pin(local.prepare_local(root, frozen, stack)).await?,
            ModuleSource::Git(_) => {
                let directory = remote[alias]
                    .as_ref()
                    .context("Git dependency was not prepared")?;
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
            ModuleSource::Registry(_) | ModuleSource::Url(_) => remote[alias]
                .clone()
                .context("Remote dependency was not prepared")?,
        };
        let artifact = install_artifact(source, alias, dependency, &artifact)?;
        if manifest.module.runtime == ModuleRuntime::Component {
            let bytes = std::fs::read(&artifact)?;
            let interface = composition::interface(alias, &bytes)?;
            pipeline_sources.extend(fluentci_engine::components::pipeline_bindings::sources(
                alias,
                &bytes,
                manifest.module.sdk.name(),
            )?);
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
    if manifest.module.runtime == ModuleRuntime::Component {
        pipeline_sources.extend(crate::scaffold::pipeline_support(manifest.module.sdk)?);
        install_pipeline_sources(source, pipeline_sources)?;
    }
    Ok(prepared)
}

pub async fn finish(artifact: &Path, dependencies: &Prepared) -> Result<PathBuf> {
    if dependencies.artifacts.is_empty() {
        return Ok(artifact.to_owned());
    }
    let bytes = if dependencies.runtime == Some(ModuleRuntime::Component) {
        // Composition nests the original component and its custom sections.
        // Keep only the root export metadata at the new outer boundary and
        // validate it against the composed WIT before help or publishing uses it.
        let functions = crate::plugin_metadata::inspect(&std::fs::read(artifact)?, None)?;
        let composed = composition::compose(artifact, &dependencies.interfaces)?;
        crate::plugin_metadata::embed(&composed, functions)?
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

fn install_pipeline_sources(source: &Path, files: BTreeMap<String, String>) -> Result<()> {
    let inventory = source.join(".fluentci/dependencies/pipeline-files.json");
    let previous: BTreeMap<String, String> = if inventory.exists() {
        serde_json::from_slice(&std::fs::read(&inventory)?)?
    } else {
        BTreeMap::new()
    };
    let runtime = source.join(".sdk/inspection/composition-runtime.mjs");
    let runtime = serde_json::to_string(&runtime.to_string_lossy())?;
    let raw_files = files.clone();
    let files = files
        .into_iter()
        .map(|(path, content)| {
            (
                path,
                content
                    .replace("'fluentci:pipeline'", &runtime)
                    .replace("\"fluentci:pipeline\"", &runtime),
            )
        })
        .collect::<BTreeMap<_, _>>();
    for path in previous.keys().chain(files.keys()) {
        ensure!(
            !Path::new(path).is_absolute()
                && !Path::new(path)
                    .components()
                    .any(|part| matches!(part, std::path::Component::ParentDir)),
            "Unsafe generated pipeline path"
        );
        let destination = source.join(path);
        if destination.exists() {
            let bytes = std::fs::read(&destination)?;
            let unchanged = previous
                .get(path)
                .is_some_and(|digest| *digest == sha256::digest(&bytes));
            let identical = files
                .get(path)
                .is_some_and(|content| content.as_bytes() == bytes)
                || raw_files
                    .get(path)
                    .is_some_and(|content| content.as_bytes() == bytes);
            let known_previous_sdk = [
                (
                    ".sdk/elixir/lib/fluentci/plugin/codegen.ex",
                    "34b7b44002d8afa266282cbc81450818860145dfafa30fd4a37e2c0b9f03e037",
                ),
                (
                    ".sdk/elixir/lib/mix/tasks/fluentci.plugin.build.ex",
                    "627ffe7e112e2ac84a1bb4162f629e172cc7157a4353f8fb734b5d68207cbbe2",
                ),
            ]
            .iter()
            .any(|(name, digest)| path == name && sha256::digest(&bytes) == *digest);
            ensure!(
                unchanged || identical || known_previous_sdk,
                "Refusing to replace edited or unowned pipeline binding: {}",
                destination.display()
            );
        }
    }
    let mut next = BTreeMap::new();
    for (path, content) in &files {
        let destination = source.join(path);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        crate::modules::write_if_changed(&destination, content.as_bytes())?;
        next.insert(path.clone(), sha256::digest(content.as_bytes()));
    }
    for path in previous.keys().filter(|path| !next.contains_key(*path)) {
        let file = source.join(path);
        if file.exists() {
            std::fs::remove_file(file)?;
        }
    }
    crate::modules::write_if_changed(&inventory, &serde_json::to_vec_pretty(&next)?)?;
    Ok(())
}
