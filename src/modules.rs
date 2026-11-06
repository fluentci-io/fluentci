//! Declared Wasm modules, Cargo artifact resolution, and export discovery.

use crate::{
    config::{Config, Module, Sdk},
    process, tools,
    workspace::Workspace,
};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use tokio::process::Command;
use wasmparser::{ExternalKind, Parser, Payload};

const WASM_TARGET: &str = "wasm32-unknown-unknown";

#[derive(Debug)]
pub struct LocalModule {
    pub name: String,
    pub source: ModuleSource,
    pub definition: Module,
}

#[derive(Debug)]
pub enum ModuleSource {
    Path(PathBuf),
    Url(reqwest::Url),
    Registry(String),
    Git(String),
}

impl ModuleSource {
    fn display(&self) -> String {
        match self {
            Self::Path(path) => path.display().to_string(),
            Self::Url(url) => url.to_string(),
            Self::Registry(package) => package.clone(),
            Self::Git(url) => url.clone(),
        }
    }

    fn path(&self) -> Result<&Path> {
        match self {
            Self::Path(path) => Ok(path),
            Self::Url(_) | Self::Registry(_) | Self::Git(_) => {
                anyhow::bail!("URL modules do not have a local source directory")
            }
        }
    }
}

impl LocalModule {
    pub fn resolve(config: &Path, module: &Module) -> Result<Self> {
        let source = if let Some(url) = &module.git {
            ModuleSource::Git(url.clone())
        } else if let Some(package) = module.registry_package() {
            ModuleSource::Registry(package.into())
        } else if let Some(url) = &module.url {
            ModuleSource::Url(crate::config::validate_module_url(url)?)
        } else {
            let path = config
                .parent()
                .context("Configuration has no parent directory")?
                .join(module.path.as_ref().context("Missing module path")?);
            let source = path.canonicalize().with_context(|| {
                format!(
                    "Module {:?} source {} does not exist",
                    module.name,
                    path.display()
                )
            })?;
            ModuleSource::Path(source)
        };
        Ok(Self {
            name: module.name.clone(),
            source,
            definition: module.clone(),
        })
    }

    /// Read exports without builds, downloads, or SDK setup.
    pub async fn cached_functions(&self) -> Result<Vec<String>> {
        let artifact = match &self.source {
            ModuleSource::Registry(_) | ModuleSource::Git(_) => {
                return Ok(self
                    .definition
                    .functions
                    .iter()
                    .map(|f| f.name.clone())
                    .collect());
            }
            ModuleSource::Url(url) => dirs::cache_dir()
                .context("Cache directory is unavailable")?
                .join("fluentci/modules")
                .join(format!("{}.wasm", sha256::digest(url.as_str()))),
            ModuleSource::Path(source) if source.extension().is_some_and(|ext| ext == "wasm") => {
                source.clone()
            }
            ModuleSource::Path(source)
                if self.definition.sdk != Sdk::Rust || self.definition.build.is_some() =>
            {
                source.join(
                    self.definition
                        .artifact
                        .as_deref()
                        .unwrap_or(Path::new("dist/plugin.wasm")),
                )
            }
            ModuleSource::Path(source) => {
                let manifest = if source.is_dir() {
                    source.join("Cargo.toml")
                } else {
                    source.clone()
                };
                let mut command = Command::new("cargo");
                command
                    .args([
                        "metadata",
                        "--offline",
                        "--locked",
                        "--no-deps",
                        "--format-version=1",
                        "--manifest-path",
                    ])
                    .arg(&manifest)
                    .current_dir(
                        manifest
                            .parent()
                            .context("Manifest has no parent directory")?,
                    )
                    .kill_on_drop(true);
                let output =
                    tokio::time::timeout(std::time::Duration::from_secs(5), command.output())
                        .await??;
                anyhow::ensure!(output.status.success(), "Cargo metadata unavailable");
                let metadata: CargoMetadata = serde_json::from_slice(&output.stdout)?;
                let package = metadata
                    .packages
                    .iter()
                    .find(|package| package.manifest_path == manifest)
                    .context("Module package is missing")?;
                let target = package
                    .targets
                    .iter()
                    .find(|target| target.crate_types.iter().any(|kind| kind == "cdylib"))
                    .context("Module has no cdylib target")?;
                metadata
                    .target_directory
                    .join(WASM_TARGET)
                    .join("release")
                    .join(format!("{}.wasm", target.name.replace('-', "_")))
            }
        };
        if !artifact.is_file() {
            return Ok(Vec::new());
        }
        functions(&tokio::fs::read(artifact).await?)
    }

    pub async fn prepare_with_lock(&self, root: &Path, frozen: bool) -> Result<PathBuf> {
        if let ModuleSource::Registry(reference) = &self.source {
            let package = crate::lockfile::resolve(root, reference, frozen).await?;
            return crate::registry::wasm_artifact(&package).await;
        }
        if let ModuleSource::Git(_) = &self.source {
            let source = crate::lockfile::git_source(root, &self.definition, frozen, false).await?;
            let local = Self {
                name: self.name.clone(),
                definition: self.definition.clone(),
                source: ModuleSource::Path(source),
            };
            return Box::pin(local.prepare()).await;
        }
        self.prepare().await
    }

    pub async fn prepare(&self) -> Result<PathBuf> {
        if let ModuleSource::Git(_) = &self.source {
            let workspace = Workspace::current()?;
            return Box::pin(self.prepare_with_lock(&workspace.root, false)).await;
        }
        if let ModuleSource::Registry(reference) = &self.source {
            let workspace = Workspace::current()?;
            let package = crate::lockfile::resolve(&workspace.root, reference, false).await?;
            return crate::registry::wasm_artifact(&package).await;
        }
        if let ModuleSource::Url(url) = &self.source {
            return download(url).await;
        }
        let source = self.source.path()?;
        if source.is_file()
            && source
                .extension()
                .is_some_and(|extension| extension == "wasm")
        {
            return Ok(source.to_path_buf());
        }
        if self.definition.sdk != Sdk::Rust || self.definition.build.is_some() {
            return self.build_sdk().await.with_context(|| {
                format!(
                    "Building {} module {:?}",
                    self.definition.sdk.name(),
                    self.name
                )
            });
        }
        let manifest = if source.is_dir() {
            source.join("Cargo.toml")
        } else {
            source.to_path_buf()
        };
        anyhow::ensure!(
            manifest
                .file_name()
                .is_some_and(|name| name == "Cargo.toml")
                && manifest.is_file(),
            "Module {:?} must point to a .wasm file, Rust crate directory, or Cargo.toml",
            self.name
        );
        build(&manifest)
            .await
            .with_context(|| format!("Building module {:?}", self.name))
    }

    async fn build_sdk(&self) -> Result<PathBuf> {
        let source = self.source.path()?;
        anyhow::ensure!(
            source.is_dir(),
            "SDK module source must be a directory: {}",
            source.display()
        );
        let artifact = source.join(
            self.definition
                .artifact
                .as_deref()
                .unwrap_or(Path::new("dist/plugin.wasm")),
        );
        if let Some(build) = &self.definition.build {
            let program = tools::require_build_command(&build[0], source)?;
            process::execute_build(&program.to_string_lossy(), &build[1..], source).await?;
        } else {
            match self.definition.sdk {
                Sdk::Purescript
                | Sdk::Clojurescript
                | Sdk::Gleam
                | Sdk::Typescript
                | Sdk::Rescript => {
                    tools::require_sdk(self.definition.sdk, source, true)?;
                    if !source.join("node_modules").is_dir() {
                        let install = if source.join("package-lock.json").is_file() {
                            "ci"
                        } else {
                            "install"
                        };
                        process::execute_build("npm", [install], source).await?;
                    }
                    tools::require_sdk(self.definition.sdk, source, false)?;
                    process::execute_build("npm", ["run", "build"], source).await?;
                }
                Sdk::Elixir => {
                    tools::require_sdk(Sdk::Elixir, source, false)?;
                    let entry = self
                        .definition
                        .entry
                        .as_deref()
                        .context("Elixir SDK requires an entry module")?;
                    process::execute_build("rustup", ["target", "add", WASM_TARGET], source)
                        .await?;
                    process::execute_build("mix", ["deps.get"], source).await?;
                    process::execute_build(
                        "mix",
                        [
                            "fluentci.plugin.build",
                            entry,
                            "--output",
                            &artifact.to_string_lossy(),
                        ],
                        source,
                    )
                    .await?;
                }
                Sdk::Python => {
                    tools::require_sdk(Sdk::Python, source, false)?;
                    let entry = self.definition.entry.as_deref().unwrap_or("plugin.py");
                    process::execute_build(
                        "uv",
                        [
                            "run",
                            "fluentci-plugin",
                            entry,
                            "-o",
                            &artifact.to_string_lossy(),
                        ],
                        source,
                    )
                    .await?;
                }
                Sdk::Rust => unreachable!("Rust modules use Cargo unless build is overridden"),
            }
        }
        anyhow::ensure!(
            artifact.is_file(),
            "Build did not produce {}",
            artifact.display()
        );
        Ok(artifact.canonicalize()?)
    }
}

pub fn resolve(root: &Path, name: &str) -> Result<Option<LocalModule>> {
    let workspace = Workspace::discover(root)?;
    let Some(path) = workspace.config else {
        return Ok(None);
    };
    let config = Config::read(&path)?;
    config
        .modules
        .iter()
        .find(|module| module.name == name)
        .map(|module| LocalModule::resolve(&path, module))
        .transpose()
}

pub fn discover(workspace: &Workspace) -> Result<Vec<LocalModule>> {
    if let Some(path) = &workspace.config {
        let config = Config::read(path)?;
        if !config.modules.is_empty() {
            return config
                .modules
                .iter()
                .map(|module| LocalModule::resolve(path, module))
                .collect();
        }
    }
    let legacy = [".fluentci/plugin", ".fluentci", "plugin", "."]
        .iter()
        .map(|path| workspace.root.join(path))
        .find(|path| path.join("Cargo.toml").is_file() && is_wasm_crate(&path.join("Cargo.toml")));
    Ok(legacy
        .into_iter()
        .map(|source| LocalModule {
            name: ".".into(),
            definition: Module {
                name: ".".into(),
                package: None,
                git: None,
                rev: None,
                subdir: None,
                repository: None,
                logo: None,
                functions: vec![],
                version: None,
                description: None,
                license: None,
                path: Some(source.clone()),
                url: None,
                sdk: Sdk::Rust,
                entry: None,
                artifact: None,
                build: None,
            },
            source: ModuleSource::Path(source),
        })
        .collect())
}

fn is_wasm_crate(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| toml::from_str::<toml::Value>(&text).ok())
        .and_then(|manifest| manifest.get("lib")?.get("crate-type")?.as_array().cloned())
        .is_some_and(|types| types.iter().any(|kind| kind.as_str() == Some("cdylib")))
}

#[derive(Deserialize)]
struct CargoMetadata {
    packages: Vec<CargoPackage>,
    target_directory: PathBuf,
}

#[derive(Deserialize)]
struct CargoPackage {
    name: String,
    manifest_path: PathBuf,
    targets: Vec<CargoTarget>,
}

#[derive(Deserialize)]
struct CargoTarget {
    name: String,
    crate_types: Vec<String>,
}

pub async fn build(manifest: &Path) -> Result<PathBuf> {
    let manifest = manifest.canonicalize()?;
    let directory = manifest
        .parent()
        .context("Cargo manifest has no parent directory")?;
    tools::require_sdk(Sdk::Rust, directory, false)?;
    let output = Command::new("cargo")
        .args([
            "metadata",
            "--no-deps",
            "--format-version=1",
            "--manifest-path",
        ])
        .arg(&manifest)
        .current_dir(directory)
        .output()
        .await
        .context("Starting cargo metadata")?;
    anyhow::ensure!(
        output.status.success(),
        "cargo metadata failed for {}: {}",
        manifest.display(),
        String::from_utf8_lossy(&output.stderr).trim()
    );
    let metadata: CargoMetadata = serde_json::from_slice(&output.stdout)?;
    let package = metadata
        .packages
        .iter()
        .find(|package| package.manifest_path == manifest)
        .context("Module path must identify a Cargo package, not a workspace-only manifest")?;
    let target = package
        .targets
        .iter()
        .find(|target| target.crate_types.iter().any(|kind| kind == "cdylib"))
        .context("Module must declare [lib] crate-type = [\"cdylib\"]")?;
    process::execute_build("rustup", ["target", "add", WASM_TARGET], directory).await?;
    let mut command = Command::new("cargo");
    command
        .args([
            "build",
            "--release",
            "--target",
            WASM_TARGET,
            "--manifest-path",
        ])
        .arg(&manifest)
        .args(["--package", &package.name])
        .current_dir(directory);
    process::run_build(&mut command).await?;
    let artifact = metadata
        .target_directory
        .join(WASM_TARGET)
        .join("release")
        .join(format!("{}.wasm", target.name.replace('-', "_")));
    anyhow::ensure!(
        artifact.is_file(),
        "Cargo did not produce {}",
        artifact.display()
    );
    Ok(artifact)
}

pub fn functions(bytes: &[u8]) -> Result<Vec<String>> {
    let mut functions = Vec::new();
    for payload in Parser::new(0).parse_all(bytes) {
        if let Payload::ExportSection(exports) = payload? {
            for export in exports {
                let export = export?;
                if export.kind == ExternalKind::Func
                    && !export.name.starts_with("__")
                    && !export.name.starts_with("PyInit_")
                    && !matches!(export.name, "_start" | "_initialize")
                {
                    functions.push(export.name.to_owned());
                }
            }
        }
    }
    functions.sort();
    functions.dedup();
    Ok(functions)
}

#[derive(Serialize)]
struct ModuleInfo {
    name: String,
    sdk: Sdk,
    source: String,
    wasm: PathBuf,
    functions: Vec<String>,
}

#[derive(Serialize)]
struct Discovery {
    workspace: PathBuf,
    config: Option<PathBuf>,
    modules: Vec<ModuleInfo>,
}

pub async fn inspect(name: Option<&str>, json: bool) -> Result<()> {
    let workspace = Workspace::current()?;
    let modules = discover(&workspace)?;
    if let Some(name) = name {
        anyhow::ensure!(
            modules.iter().any(|module| module.name == name),
            "No declared module named {name:?}"
        );
    }
    let mut found = Vec::new();
    for module in modules
        .into_iter()
        .filter(|module| name.is_none_or(|name| module.name == name))
    {
        let wasm = module.prepare().await?;
        let functions = functions(&tokio::fs::read(&wasm).await?)
            .with_context(|| format!("Inspecting module {:?}", module.name))?;
        found.push(ModuleInfo {
            name: module.name,
            sdk: module.definition.sdk,
            source: module.source.display(),
            wasm,
            functions,
        });
    }
    let discovery = Discovery {
        workspace: workspace.root,
        config: workspace.config,
        modules: found,
    };
    if json {
        println!("{}", serde_json::to_string_pretty(&discovery)?);
    } else {
        println!("Workspace: {}", discovery.workspace.display());
        if discovery.modules.is_empty() {
            println!(
                "No Wasm modules found. Run fluentci init or declare [[modules]] in fluentci.toml."
            );
        }
        for module in discovery.modules {
            println!(
                "\n{} [{}] ({})",
                module.name,
                module.sdk.name(),
                module.source
            );
            for function in module.functions {
                println!("  {function}");
            }
        }
    }
    Ok(())
}

pub async fn add(
    name: &str,
    sdk: Sdk,
    path: Option<&Path>,
    url: Option<&str>,
    entry: Option<&str>,
) -> Result<()> {
    crate::config::validate_module_name(name)?;
    let workspace = Workspace::current()?;
    let config_path = workspace
        .config
        .as_ref()
        .context("No fluentci.toml found; run fluentci init first")?;
    let original = tokio::fs::read_to_string(config_path).await?;
    let config = Config::parse(&original)?;
    anyhow::ensure!(
        !config.modules.iter().any(|module| module.name == name),
        "Module {name:?} is already declared"
    );
    let parent = config_path
        .parent()
        .context("Configuration has no parent directory")?;
    let destination = match path {
        Some(path) => path
            .canonicalize()
            .with_context(|| format!("Module source {} does not exist", path.display()))?,
        None => workspace.root.join(".fluentci").join(name),
    };
    if path.is_none() && url.is_none() {
        anyhow::ensure!(
            !destination.exists(),
            "Refusing to overwrite {}",
            destination.display()
        );
    }
    let definition = Module {
        name: name.into(),
        package: None,
        git: None,
        rev: None,
        subdir: None,
        repository: None,
        logo: None,
        functions: vec![],
        version: None,
        description: None,
        license: None,
        path: url
            .is_none()
            .then(|| crate::workspace::relative_path(parent, &destination)),
        url: url.map(Into::into),
        sdk,
        entry: entry.map(Into::into).or_else(|| {
            (sdk == Sdk::Elixir && path.is_none() && url.is_none()).then(|| "Main".into())
        }),
        artifact: None,
        build: None,
    };
    let mut document: toml_edit::DocumentMut = original.parse()?;
    let mut table = toml_edit::Table::new();
    table["name"] = toml_edit::value(name);
    if let Some(path) = &definition.path {
        table["path"] = toml_edit::value(path.to_str().context("Module path must be valid UTF-8")?);
    }
    if let Some(url) = &definition.url {
        table["url"] = toml_edit::value(url);
    }
    table["sdk"] = toml_edit::value(sdk.name());
    if let Some(entry) = &definition.entry {
        table["entry"] = toml_edit::value(entry);
    }
    match document.get_mut("modules") {
        Some(item) => {
            if let Some(modules) = item.as_array_of_tables_mut() {
                modules.push(table);
            } else if let Some(modules) = item.as_array_mut() {
                modules.push(table.into_inline_table());
            } else {
                anyhow::bail!("modules must be an array of module declarations");
            }
        }
        None => {
            let mut modules = toml_edit::ArrayOfTables::new();
            modules.push(table);
            document["modules"] = toml_edit::Item::ArrayOfTables(modules);
        }
    }
    let updated = document.to_string();
    Config::parse(&updated)?;
    if path.is_none() && url.is_none() {
        tokio::fs::create_dir_all(
            destination
                .parent()
                .context("Module has no parent directory")?,
        )
        .await?;
        let temporary = tempfile::tempdir_in(
            destination
                .parent()
                .context("Module has no parent directory")?,
        )?;
        crate::scaffold::write(temporary.path(), name, sdk).await?;
        tokio::fs::rename(temporary.path(), &destination).await?;
    }
    anyhow::ensure!(
        tokio::fs::read_to_string(config_path).await? == original,
        "Configuration changed while adding the module; retry the command"
    );
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(updated.as_bytes())?;
    temporary
        .as_file()
        .set_permissions(std::fs::metadata(config_path)?.permissions())?;
    temporary.persist(config_path)?;
    println!(
        "Added {} module {name:?} at {}",
        sdk.name(),
        url.map_or_else(|| destination.display().to_string(), Into::into)
    );
    Ok(())
}

pub(crate) async fn download(url: &reqwest::Url) -> Result<PathBuf> {
    let directory = dirs::cache_dir()
        .context("Cache directory is unavailable")?
        .join("fluentci/modules");
    tokio::fs::create_dir_all(&directory).await?;
    let artifact = directory.join(format!("{}.wasm", sha256::digest(url.as_str())));
    if artifact.is_file() {
        return Ok(artifact);
    }
    let bytes = crate::registry::client()
        .get(url.clone())
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    functions(&bytes).context("Downloaded module is not valid WebAssembly")?;
    let mut temporary = tempfile::NamedTempFile::new_in(&directory)?;
    temporary.write_all(&bytes)?;
    temporary.persist(&artifact)?;
    Ok(artifact)
}
