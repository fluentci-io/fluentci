use crate::config::{self, Config, Module};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum Dependency {
    Package(String),
    Source(toml::Table),
}

impl Dependency {
    pub fn definition(&self, alias: &str) -> Result<Module> {
        config::validate_module_name(alias)?;
        ensure!(
            alias != "root" && !alias.starts_with("wasi"),
            "Reserved dependency alias {alias}"
        );
        let mut value = match self {
            Self::Package(package) => {
                toml::Value::try_from(BTreeMap::from([("package", package)]))?
            }
            Self::Source(source) => toml::Value::Table(source.clone()),
        };
        value
            .as_table_mut()
            .context("Dependency must be a table")?
            .insert("name".into(), alias.into());
        let module: Module = value.try_into()?;
        let configuration = Config {
            services: vec![],
            steps: vec![],
            package: None,
            modules: vec![module],
        };
        Ok(Config::parse(&toml::to_string(&configuration)?)?
            .modules
            .remove(0))
    }
}

#[derive(Debug, Clone)]
pub struct Manifest {
    pub module: Module,
    pub dependencies: BTreeMap<String, Dependency>,
}

impl Manifest {
    pub fn read(root: &Path) -> Result<Option<Self>> {
        let path = root.join(super::FILE);
        if !path.is_file() {
            return Ok(None);
        }
        Self::parse(
            &std::fs::read_to_string(&path)
                .with_context(|| format!("Reading {}", path.display()))?,
        )
        .map(Some)
    }

    pub fn parse(source: &str) -> Result<Self> {
        let mut value: toml::Value =
            toml::from_str(source).context("Invalid fluentci-module.toml")?;
        let table = value
            .as_table_mut()
            .context("Module manifest must be a table")?;
        let dependencies = table
            .remove("dependencies")
            .map(|value| value.try_into())
            .transpose()?
            .unwrap_or_default();
        for field in ["path", "url", "package", "git", "rev", "subdir"] {
            ensure!(
                !table.contains_key(field),
                "{field} belongs in a dependency or workspace declaration, not module metadata"
            );
        }
        table.insert("path".into(), ".".into());
        let module: Module = value.try_into()?;
        let configuration = Config {
            services: vec![],
            steps: vec![],
            package: None,
            modules: vec![module],
        };
        let module = Config::parse(&toml::to_string(&configuration)?)?
            .modules
            .remove(0);
        if let Some(version) = &module.version {
            semver::Version::parse(version).context("Invalid module version")?;
        }
        let manifest = Self {
            module,
            dependencies,
        };
        for (alias, dependency) in &manifest.dependencies {
            dependency.definition(alias)?;
        }
        Ok(manifest)
    }
}
