//! Publish verified Wasm artifacts and AT Protocol package records.

use crate::{auth, config, db::Db, modules, registry, workspace::Workspace};
use anyhow::{Context, Result};
use jacquard::{
    api::com_atproto::repo::create_record::CreateRecord,
    prelude::XrpcClient,
    types::{
        ident::AtIdentifier,
        recordkey::RecordKey,
        string::{Did, Nsid},
    },
};
use serde::{Deserialize, Serialize};
use std::{
    io::{self, IsTerminal},
    path::Path,
    time::Duration,
};

pub const COLLECTION: &str = "io.fluentci.plugin";
pub const MAX_WASM_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Default, clap::Args)]
pub struct MetadataOptions {
    /// Optional module source directory inside the Git repository
    #[arg(long, value_name = "PATH")]
    pub subdir: Option<std::path::PathBuf>,
    /// Optional source Git repository URL
    #[arg(long, value_name = "URL")]
    pub repository: Option<String>,
    /// JSON function metadata manifest, supported by every SDK
    #[arg(long, value_name = "JSON")]
    pub manifest: Option<std::path::PathBuf>,
    /// Published package name (required for file/URL publishing; prompts if omitted)
    #[arg(long, value_name = "NAME")]
    pub name: Option<String>,
    /// Published package SemVer version
    #[arg(long, value_name = "VERSION")]
    pub version: Option<String>,
    /// Published package description
    #[arg(long, value_name = "TEXT")]
    pub description: Option<String>,
    /// Published package license (for example MIT)
    #[arg(long, value_name = "LICENSE")]
    pub license: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRecord {
    #[serde(rename = "$type")]
    pub record_type: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub published_at: String,
    pub author: String,
    pub license: String,
    pub url: String,
    pub sha256: String,
    pub size: usize,
    pub functions: Vec<crate::plugin_metadata::Function>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subdir: Option<String>,
}

#[derive(Deserialize)]
struct Upload {
    url: String,
    sha256: String,
    size: usize,
}

pub fn validate_metadata(
    name: &str,
    version: &str,
    description: &str,
    license: &str,
) -> Result<()> {
    anyhow::ensure!(
        !name.is_empty()
            && name.len() <= 64
            && name.as_bytes()[0].is_ascii_lowercase()
            && name
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-'),
        "Package names must start with a lowercase letter and contain only lowercase letters, digits, or hyphens (maximum 64 characters)"
    );
    let parsed = semver::Version::parse(version).context("Package version must be valid SemVer")?;
    anyhow::ensure!(
        version.len() <= 128 && parsed.build.is_empty(),
        "Package versions cannot include +build metadata because it is not allowed in record keys"
    );
    anyhow::ensure!(
        description.chars().count() <= 2048,
        "Description is too long"
    );
    anyhow::ensure!(
        !license.trim().is_empty() && license.len() <= 128,
        "Set license in the selected module in fluentci.toml (for example MIT or MPL-2.0)"
    );
    Ok(())
}

pub fn wasm_url(value: &str) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(value).context("Invalid Wasm URL")?;
    anyhow::ensure!(
        matches!(url.scheme(), "https" | "http")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path().ends_with(".wasm"),
        "Wasm URL must use HTTP(S) and end with .wasm, without credentials, query parameters, or a fragment"
    );
    Ok(url)
}

pub fn validate_wasm(bytes: &[u8]) -> Result<()> {
    anyhow::ensure!(
        (8..=MAX_WASM_BYTES).contains(&bytes.len()) && bytes.starts_with(b"\0asm\x01\0\0\0"),
        "Expected a Wasm module of at most 64 MiB"
    );
    wasmparser::Validator::new()
        .validate_all(bytes)
        .context("Invalid Wasm module")?;
    Ok(())
}

pub async fn download(value: &str) -> Result<Vec<u8>> {
    let url = wasm_url(value)?;
    let mut response = registry::client()
        .get(url)
        .timeout(Duration::from_secs(60))
        .send()
        .await?;
    anyhow::ensure!(
        response.status() == reqwest::StatusCode::OK,
        "Wasm URL must return HTTP 200 (received {})",
        response.status()
    );
    wasm_url(response.url().as_str())?;
    anyhow::ensure!(
        response.content_length().unwrap_or(0) <= MAX_WASM_BYTES as u64,
        "Wasm exceeds the 64 MiB size limit"
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        anyhow::ensure!(
            bytes.len() + chunk.len() <= MAX_WASM_BYTES,
            "Wasm exceeds the 64 MiB size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    validate_wasm(&bytes)?;
    Ok(bytes)
}

fn metadata(
    root: &Path,
    selected: Option<&str>,
    overrides: &MetadataOptions,
    artifact: bool,
) -> Result<(String, String, String, String)> {
    let config_path = config::find(root);
    let config = config_path
        .as_ref()
        .map(|path| config::Config::read(path))
        .transpose()?;
    let module = if let Some(config) = &config {
        if let Some(selected) = selected {
            Some(
                config
                    .modules
                    .iter()
                    .find(|module| module.name == selected)
                    .context("Module not found")?,
            )
        } else if config.modules.len() == 1 {
            config.modules.first()
        } else if config.modules.is_empty() {
            None
        } else {
            let matched = config
                .modules
                .iter()
                .find(|module| Some(module.name.as_str()) == overrides.name.as_deref());
            anyhow::ensure!(
                artifact || matched.is_some(),
                "Specify --module to select publishing metadata when the project declares multiple modules"
            );
            matched
        }
    } else {
        anyhow::ensure!(selected.is_none(), "Module not found");
        None
    };
    let source = module.and_then(|module| module.path.as_ref()).map(|path| {
        config_path
            .as_ref()
            .and_then(|path| path.parent())
            .unwrap_or(root)
            .join(path)
    });
    let mut manifests = Vec::new();
    if let Some(source) = source {
        manifests.push(
            if source.file_name().is_some_and(|name| name == "Cargo.toml") {
                source
            } else {
                source.join("Cargo.toml")
            },
        );
    } else if module.is_none() {
        manifests.extend([root.join("Cargo.toml"), root.join("plugin/Cargo.toml")]);
    }
    let cargo = manifests
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| -> Result<toml::Value> { Ok(toml::from_str(&std::fs::read_to_string(path)?)?) })
        .transpose()?;
    let cargo_field = |name: &str| {
        cargo
            .as_ref()
            .and_then(|cargo| cargo.get("package"))
            .and_then(|package| package.get(name))
            .and_then(|value| value.as_str())
            .map(str::to_owned)
    };
    // Keep legacy package metadata only for configurations without module declarations.
    let package = config
        .as_ref()
        .filter(|_| module.is_none())
        .and_then(|config| config.package.as_ref());
    let fields = MetadataOptions {
        subdir: None,
        repository: None,
        manifest: None,
        name: overrides.name.clone().or_else(|| {
            if artifact {
                None
            } else {
                module
                    .map(|module| module.name.clone())
                    .or_else(|| package.map(|package| package.name.clone()))
                    .or_else(|| cargo_field("name"))
            }
        }),
        version: overrides
            .version
            .clone()
            .or_else(|| module.and_then(|module| module.version.clone())),
        description: overrides
            .description
            .clone()
            .or_else(|| module.and_then(|module| module.description.clone()))
            .or_else(|| package.and_then(|package| package.description.clone()))
            .or_else(|| cargo_field("description")),
        license: overrides
            .license
            .clone()
            .or_else(|| module.and_then(|module| module.license.clone()))
            .or_else(|| package.and_then(|package| package.license.clone()))
            .or_else(|| cargo_field("license")),
    };
    complete_metadata(
        fields,
        io::stdin().is_terminal() && io::stderr().is_terminal(),
        |label, required| {
            let mut prompt = inquire::Text::new(label).with_validator(move |value: &str| {
                Ok(if required && value.trim().is_empty() {
                    inquire::validator::Validation::Invalid("This field is required".into())
                } else {
                    inquire::validator::Validation::Valid
                })
            });
            if label == "License" {
                prompt = prompt
                    .with_help_message("Type to filter common SPDX licenses; Tab completes. Custom values are allowed.")
                    .with_autocomplete(|input: &str| Ok(license_suggestions(input)));
            }
            prompt
                .prompt()
                .map(|value| value.trim().to_owned())
                .context("Publishing cancelled while entering metadata")
        },
    )
}

fn license_suggestions(input: &str) -> Vec<String> {
    const LICENSES: &[&str] = &[
        "MIT",
        "Apache-2.0",
        "MPL-2.0",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "ISC",
        "0BSD",
        "Unlicense",
        "CC0-1.0",
        "AGPL-3.0-only",
        "AGPL-3.0-or-later",
        "GPL-2.0-only",
        "GPL-2.0-or-later",
        "GPL-3.0-only",
        "GPL-3.0-or-later",
        "LGPL-2.1-only",
        "LGPL-2.1-or-later",
        "LGPL-3.0-only",
        "LGPL-3.0-or-later",
        "BSL-1.0",
        "EPL-2.0",
        "EUPL-1.2",
        "Zlib",
        "Artistic-2.0",
    ];
    let prefix = input.trim().to_ascii_lowercase();
    LICENSES
        .iter()
        .filter(|license| license.to_ascii_lowercase().starts_with(&prefix))
        .map(|license| (*license).to_owned())
        .collect()
}

fn complete_metadata(
    mut fields: MetadataOptions,
    interactive: bool,
    mut prompt: impl FnMut(&str, bool) -> Result<String>,
) -> Result<(String, String, String, String)> {
    let missing = [
        ("--name", fields.name.as_deref()),
        ("--version", fields.version.as_deref()),
        ("--license", fields.license.as_deref()),
    ]
    .into_iter()
    .filter(|(_, value)| value.is_none_or(|value| value.trim().is_empty()))
    .map(|(flag, _)| flag)
    .collect::<Vec<_>>();
    anyhow::ensure!(
        interactive || missing.is_empty(),
        "Missing publishing metadata: {}. Supply these flags or set module metadata in fluentci.toml; run in an interactive terminal to enter missing fields",
        missing.join(", ")
    );
    if interactive {
        for (label, field, required) in [
            ("Package name", &mut fields.name, true),
            ("Version", &mut fields.version, true),
            ("Description (optional)", &mut fields.description, false),
            ("License", &mut fields.license, true),
        ] {
            if field
                .as_ref()
                .is_some_and(|value| !required || !value.trim().is_empty())
            {
                continue;
            }
            *field = Some(prompt(label, required)?);
        }
    }
    let name = fields.name.unwrap_or_default();
    let version = fields.version.unwrap_or_default();
    let description = fields.description.unwrap_or_default();
    let license = fields.license.unwrap_or_default();
    validate_metadata(&name, &version, &description, &license)?;
    Ok((name, version, description, license))
}

pub async fn publish(
    db: &Db,
    external: Option<&str>,
    file: Option<&Path>,
    module: Option<&str>,
    metadata_options: &MetadataOptions,
) -> Result<()> {
    let workspace = Workspace::current()?;
    let (name, version, description, license) = metadata(
        &workspace.root,
        module,
        metadata_options,
        external.is_some() || file.is_some(),
    )?;
    let bytes = if let Some(url) = external {
        download(url).await?
    } else {
        let artifact = if let Some(file) = file {
            file.to_path_buf()
        } else if let Some(path) = workspace.config.as_ref() {
            let modules = modules::discover(&workspace)?;
            let selected = if let Some(name) = module {
                modules
                    .iter()
                    .find(|m| m.name == name)
                    .context("Module not found")?
            } else {
                anyhow::ensure!(
                    modules.len() == 1,
                    "Specify --module when the project declares multiple modules"
                );
                modules.first().context("No modules configured")?
            };
            let _ = path;
            selected.prepare().await?
        } else {
            let manifest = ["plugin/Cargo.toml", "Cargo.toml"]
                .into_iter()
                .map(|p| workspace.root.join(p))
                .find(|p| p.is_file())
                .context("Specify --file, --url, or configure a module")?;
            modules::build(&manifest).await?
        };
        anyhow::ensure!(
            tokio::fs::metadata(&artifact).await?.len() <= MAX_WASM_BYTES as u64,
            "Wasm exceeds the 64 MiB size limit"
        );
        tokio::fs::read(artifact).await?
    };
    validate_wasm(&bytes)?;
    let config = config::find(&workspace.root)
        .map(|path| config::Config::read(&path))
        .transpose()?;
    let definition = config.as_ref().and_then(|config| {
        let selected = module.or(metadata_options.name.as_deref());
        selected
            .and_then(|name| config.modules.iter().find(|m| m.name == name))
            .or_else(|| (config.modules.len() == 1).then(|| &config.modules[0]))
    });
    let repository = metadata_options.repository.clone().or_else(|| {
        definition.and_then(|module| module.repository.clone().or_else(|| module.git.clone()))
    });
    if let Some(repository) = &repository {
        config::validate_repository(repository)?;
    }
    let subdir = metadata_options
        .subdir
        .as_deref()
        .or_else(|| definition.and_then(|module| module.subdir.as_deref()));
    let subdir = subdir
        .map(|subdir| -> Result<String> {
            config::validate_subdir(subdir)?;
            anyhow::ensure!(repository.is_some(), "subdir requires a repository URL");
            Ok(subdir
                .to_str()
                .context("subdir must be valid UTF-8")?
                .to_owned())
        })
        .transpose()?;
    let declared = if let Some(path) = &metadata_options.manifest {
        Some(crate::plugin_metadata::read_manifest(path, &bytes)?)
    } else {
        definition
            .filter(|m| !m.functions.is_empty())
            .map(|m| m.functions.clone())
    };
    let functions = crate::plugin_metadata::inspect(&bytes, declared)?;
    let publisher = auth::authenticate(db).await?;
    let digest = sha256::digest(bytes.as_slice());
    let size = bytes.len();
    let url = if let Some(url) = external {
        url.to_owned()
    } else {
        let token = publisher.upload_token().await?;
        let response = registry::client()
            .post(format!(
                "{}/xrpc/io.fluentci.registry.publish",
                registry::base_url()
            ))
            .bearer_auth(token)
            .query(&[("name", name.as_str()), ("version", version.as_str())])
            .header("Content-Type", "application/wasm")
            .body(bytes)
            .timeout(Duration::from_secs(120))
            .send()
            .await?;
        let upload: Upload = response.error_for_status()?.json().await?;
        wasm_url(&upload.url)?;
        anyhow::ensure!(
            upload.sha256 == digest && upload.size == size,
            "Registry upload checksum or size did not match the Wasm artifact"
        );
        upload.url
    };
    let record = PluginRecord {
        record_type: COLLECTION.into(),
        name,
        description,
        version,
        published_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        author: publisher.identity.did.to_string(),
        license,
        url,
        sha256: digest,
        size,
        functions,
        repository,
        subdir,
    };
    let key = format!("{}-{}", record.name, record.version);
    let request: CreateRecord<String> = CreateRecord {
        repo: AtIdentifier::Did(Did::new(record.author.clone())?),
        collection: Nsid::new(COLLECTION.to_owned())?,
        record: serde_json::from_value(serde_json::to_value(&record)?)?,
        rkey: Some(RecordKey::any_owned(&key)?),
        swap_commit: None,
        validate: Some(false),
        extra_data: None,
    };
    let output = publisher.session.send(request).await.context("Could not publish the plugin record to the PDS; existing name-version records are not overwritten")?.into_output()?;
    println!(
        "Published {}@{}\nRecord: {}\nWasm: {}",
        record.name, record.version, output.uri, record.url
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{MetadataOptions, complete_metadata, license_suggestions};

    #[test]
    fn publishing_license_suggestions_match_case_insensitively() {
        assert_eq!(license_suggestions("mit"), ["MIT"]);
        assert_eq!(license_suggestions("apache"), ["Apache-2.0"]);
        assert!(license_suggestions("BSD").contains(&"BSD-3-Clause".to_owned()));
        assert!(license_suggestions("custom-license").is_empty());
    }

    fn metadata(
        root: &std::path::Path,
        module: Option<&str>,
        name: Option<&str>,
    ) -> anyhow::Result<(String, String, String, String)> {
        super::metadata(
            root,
            module,
            &MetadataOptions {
                name: name.map(str::to_owned),
                ..Default::default()
            },
            false,
        )
    }

    #[test]
    fn publishing_prompts_for_missing_artifact_metadata() -> anyhow::Result<()> {
        let mut replies = ["hello-ci", "1.0.0", "", "MIT"].into_iter();
        let mut labels = Vec::new();
        let fields = complete_metadata(MetadataOptions::default(), true, |label, required| {
            labels.push((label.to_owned(), required));
            Ok(replies.next().unwrap().to_owned())
        })?;
        assert_eq!(
            fields,
            ("hello-ci".into(), "1.0.0".into(), "".into(), "MIT".into())
        );
        assert_eq!(
            labels
                .iter()
                .map(|(_, required)| *required)
                .collect::<Vec<_>>(),
            [true, true, false, true]
        );
        let error = complete_metadata(MetadataOptions::default(), false, |_, _| {
            panic!("must not prompt without a terminal")
        })
        .unwrap_err();
        assert!(error.to_string().contains("--name, --version, --license"));
        Ok(())
    }

    #[test]
    fn publishing_cargo_fallback_uses_the_module_directory() -> anyhow::Result<()> {
        let root = tempfile::tempdir()?;
        let config_dir = root.path().join(".fluentci");
        let module_dir = config_dir.join("ci");
        std::fs::create_dir_all(&module_dir)?;
        std::fs::write(
            config_dir.join("fluentci.toml"),
            "[[modules]]\nname = 'ci'\npath = 'ci'\nversion = '1.2.3'\n",
        )?;
        std::fs::write(
            module_dir.join("Cargo.toml"),
            "[package]\nname = 'internal_name'\nversion = '1.2.3'\nlicense = 'MIT'\ndescription = 'Module checks'\n",
        )?;
        std::fs::write(
            root.path().join("Cargo.toml"),
            "[package]\nname = 'workspace'\nversion = '9.9.9'\nlicense = 'Other'\n",
        )?;
        assert_eq!(
            metadata(root.path(), None, None)?,
            (
                "ci".into(),
                "1.2.3".into(),
                "Module checks".into(),
                "MIT".into()
            )
        );
        Ok(())
    }

    #[test]
    fn publishing_requires_module_version_instead_of_package_version() -> anyhow::Result<()> {
        let root = tempfile::tempdir()?;
        std::fs::write(
            root.path().join("Cargo.toml"),
            "[package]\nname = 'ci'\nversion = '9.9.9'\nlicense = 'MIT'\n",
        )?;
        for config in [
            "[package]\nname = 'ci'\nversion = '8.8.8'\nlicense = 'MIT'\n",
            "[package]\nname = 'ci'\nversion = '8.8.8'\n[[modules]]\nname = 'ci'\npath = '.'\nlicense = 'MIT'\n",
        ] {
            std::fs::write(root.path().join("fluentci.toml"), config)?;
            let error = metadata(root.path(), None, None).unwrap_err();
            assert!(error.to_string().contains("--version"));
            let fields = super::metadata(
                root.path(),
                None,
                &MetadataOptions {
                    version: Some("1.2.3".into()),
                    ..Default::default()
                },
                false,
            )?;
            assert_eq!(fields.1, "1.2.3");
        }
        Ok(())
    }

    #[test]
    fn publishing_uses_selected_module_metadata() -> anyhow::Result<()> {
        let root = tempfile::tempdir()?;
        std::fs::write(
            root.path().join("fluentci.toml"),
            r#"
[package]
name = "legacy"
version = "9.9.9"
license = "Legacy"
[[modules]]
name = "build"
path = ".fluentci/build"
version = "1.0.0"
description = "Build checks"
license = "MIT"
[[modules]]
name = "deploy"
path = ".fluentci/deploy"
version = "2.0.0"
description = "Deploy jobs"
license = "Apache-2.0"
"#,
        )?;
        assert_eq!(
            metadata(root.path(), Some("deploy"), None)?,
            (
                "deploy".into(),
                "2.0.0".into(),
                "Deploy jobs".into(),
                "Apache-2.0".into()
            )
        );
        assert_eq!(
            metadata(root.path(), Some("build"), Some("public-build"))?,
            (
                "public-build".into(),
                "1.0.0".into(),
                "Build checks".into(),
                "MIT".into()
            )
        );
        assert!(metadata(root.path(), None, None).is_err());
        assert!(metadata(root.path(), Some("missing"), None).is_err());
        assert_eq!(metadata(root.path(), None, Some("build"))?.0, "build");
        Ok(())
    }

    #[test]
    fn package_name_override_is_validated_before_publishing() -> anyhow::Result<()> {
        let root = tempfile::tempdir()?;
        let manifest = root.path().join("Cargo.toml");
        let contents = "[package]\nname = 'internal_name'\nversion = '1.2.3'\ndescription = 'Build checks'\nlicense = 'MIT'\n";
        std::fs::write(&manifest, contents)?;
        std::fs::write(
            root.path().join("fluentci.toml"),
            "[[modules]]\nname = 'internal_name'\npath = '.'\nversion = '1.2.3'\n",
        )?;
        assert!(metadata(root.path(), None, None).is_err());
        assert_eq!(
            metadata(root.path(), None, Some("public-plugin"))?,
            (
                "public-plugin".into(),
                "1.2.3".into(),
                "Build checks".into(),
                "MIT".into()
            )
        );
        for invalid in ["", "Bad_Name", "../plugin"] {
            assert!(metadata(root.path(), None, Some(invalid)).is_err());
        }
        assert_eq!(std::fs::read_to_string(manifest)?, contents);
        Ok(())
    }
}
