//! Inspect module help without instantiating or invoking a Wasm plugin.

use crate::{
    cli::{Cli, RunArgs},
    modules::{self, LocalModule, ModuleSource},
    plugin_metadata::{self, Function},
    registry,
    workspace::Workspace,
};
use anyhow::{Context, Result};
use clap::CommandFactory;
use std::{fmt::Write, path::Path};

pub fn requested(args: &RunArgs) -> bool {
    args.help
        || args
            .jobs
            .iter()
            .any(|arg| matches!(arg.as_str(), "--help" | "-h"))
}

pub async fn execute(args: &RunArgs, explicit_run: bool) -> Result<()> {
    if args.pipeline.is_none() {
        let mut cli = Cli::command();
        cli.build();
        if explicit_run {
            cli.find_subcommand_mut("run")
                .context("Missing run command")?
                .print_long_help()?;
        } else {
            cli.print_long_help()?;
        }
        println!();
        return Ok(());
    }
    let help = inspect(args).await?;
    let function = args
        .jobs
        .first()
        .filter(|name| !matches!(name.as_str(), "--help" | "-h"));
    print!("{}", help.render(function.map(String::as_str))?);
    Ok(())
}

struct ModuleHelp {
    name: String,
    version: Option<String>,
    description: Option<String>,
    functions: Vec<Function>,
}

async fn inspect(args: &RunArgs) -> Result<ModuleHelp> {
    let start = args
        .work_dir
        .as_deref()
        .unwrap_or(Path::new("."))
        .canonicalize()?;
    let workspace = Workspace::discover(&start)?;
    let name = args.pipeline.as_deref().context("Select a module")?;
    let local = if name == "." {
        let mut modules = modules::discover(&workspace)?;
        anyhow::ensure!(
            modules.len() == 1,
            "Select a module: fluentci run <module> --help"
        );
        modules.pop()
    } else {
        modules::resolve(&workspace.root, name)?
    };
    if let Some(module) = local {
        return local_help(module, &workspace.root, args.frozen_lockfile).await;
    }
    if name.starts_with("https://") || name.starts_with("http://") {
        let artifact = modules::download(&crate::config::validate_module_url(name)?).await?;
        return artifact_help(name, &artifact, None, None, None).await;
    }
    if name.ends_with(".wasm") {
        return artifact_help(name, &start.join(name), None, None, None).await;
    }
    anyhow::ensure!(
        (!name.contains("://") && !name.contains('/')) || name.starts_with('@'),
        "Module help requires a local Wasm module, HTTP(S) Wasm URL, or registry package"
    );
    registry_help(&workspace.root, name, args.frozen_lockfile).await
}

async fn local_help(module: LocalModule, root: &Path, frozen: bool) -> Result<ModuleHelp> {
    if let ModuleSource::Registry(reference) = &module.source {
        let mut help = registry_help(root, reference, frozen).await?;
        help.name = module.name;
        return Ok(help);
    }
    let artifact = module.prepare_with_lock(root, frozen).await?;
    let definition = module.definition;
    artifact_help(
        &module.name,
        &artifact,
        (!definition.functions.is_empty()).then_some(definition.functions),
        definition.description,
        definition.version,
    )
    .await
}

async fn registry_help(root: &Path, reference: &str, frozen: bool) -> Result<ModuleHelp> {
    let package = crate::plugin_metadata::resolve(root, reference, frozen).await?;
    let artifact = registry::wasm_artifact(&package).await?;
    artifact_help(
        reference,
        &artifact,
        package
            .metadata
            .functions
            .filter(|functions| !functions.is_empty()),
        package.metadata.description,
        Some(package.version),
    )
    .await
}

async fn artifact_help(
    name: &str,
    artifact: &Path,
    declared: Option<Vec<Function>>,
    description: Option<String>,
    version: Option<String>,
) -> Result<ModuleHelp> {
    let bytes = tokio::fs::read(artifact)
        .await
        .with_context(|| format!("Reading module {}", artifact.display()))?;
    Ok(ModuleHelp {
        name: name.into(),
        version,
        description,
        functions: plugin_metadata::inspect(&bytes, declared)?,
    })
}

fn text(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control() || *ch == '\n' || *ch == '\t')
        .collect()
}

impl ModuleHelp {
    fn render(&self, selected: Option<&str>) -> Result<String> {
        let mut output = text(&self.name);
        if let Some(version) = &self.version {
            write!(output, " ({})", text(version))?;
        }
        writeln!(output)?;
        if let Some(description) = &self.description {
            writeln!(output, "{}", text(description))?;
        }
        if let Some(name) = selected {
            let function = self
                .functions
                .iter()
                .find(|function| function.name == name)
                .with_context(|| {
                    format!(
                        "Function {name:?} not found. Use fluentci run {} --help to list functions",
                        self.name
                    )
                })?;
            write!(
                output,
                "\nUsage: fluentci run {} {}",
                text(&self.name),
                text(name)
            )?;
            if let Some(args) = &function.args {
                for arg in args {
                    if function.input_format != crate::plugin_metadata::InputFormat::Text {
                        write!(
                            output,
                            " {}--{} <{}>{}",
                            if arg.required { "" } else { "[" },
                            text(&arg.name),
                            text(&arg.type_name),
                            if arg.required { "" } else { "]" }
                        )?;
                    } else {
                        write!(output, " <{}>", text(&arg.name))?;
                    }
                }
            } else {
                write!(output, " [args...]")?;
            }
            writeln!(output)?;
            if let Some(description) = &function.description {
                writeln!(output, "\n{}", text(description))?;
            }
            writeln!(output, "\nArguments:")?;
            match &function.args {
                Some(args) if args.is_empty() => writeln!(output, "  No arguments.")?,
                Some(args) => {
                    for arg in args {
                        writeln!(
                            output,
                            "  {}{}: {}{}",
                            if function.input_format != crate::plugin_metadata::InputFormat::Text {
                                "--"
                            } else {
                                ""
                            },
                            text(&arg.name),
                            text(&arg.type_name),
                            if arg.required { "" } else { " (optional)" }
                        )?;
                        if let Some(description) = &arg.description {
                            writeln!(output, "    {}", text(description))?;
                        }
                    }
                }
                None => writeln!(
                    output,
                    "  Source argument names, types, and descriptions are unavailable."
                )?,
            }
            if let Some(returns) = &function.return_type {
                writeln!(output, "\nReturns: {}", text(returns))?;
            }
        } else {
            writeln!(
                output,
                "\nUsage: fluentci run {} <function> [args...]",
                text(&self.name)
            )?;
            writeln!(output, "\nFunctions:")?;
            if self.functions.is_empty() {
                writeln!(output, "  No callable functions exported.")?;
            }
            for function in &self.functions {
                write!(output, "  {}", text(&function.name))?;
                if let Some(args) = &function.args {
                    for arg in args {
                        write!(
                            output,
                            " <{}{}: {}>{}",
                            if function.input_format != crate::plugin_metadata::InputFormat::Text {
                                "--"
                            } else {
                                ""
                            },
                            text(&arg.name),
                            text(&arg.type_name),
                            if arg.required { "" } else { "?" }
                        )?;
                    }
                }
                if let Some(returns) = &function.return_type {
                    write!(output, " -> {}", text(returns))?;
                }
                writeln!(output)?;
                if let Some(description) = &function.description {
                    writeln!(output, "    {}", text(description))?;
                }
                if function.input_format != crate::plugin_metadata::InputFormat::Text {
                    for arg in function.args.iter().flatten() {
                        if let Some(description) = &arg.description {
                            writeln!(output, "    --{}: {}", text(&arg.name), text(description))?;
                        }
                    }
                }
            }
            writeln!(
                output,
                "\nUse fluentci run {} <function> --help for argument details.",
                text(&self.name)
            )?;
        }
        writeln!(
            output,
            "\nOptions:\n  -h, --help  Show help without executing the module"
        )?;
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[tokio::test]
    async fn typed_named_help_lists_flags_descriptions_requiredness_and_return_type() -> Result<()>
    {
        let temp = tempfile::tempdir()?;
        let artifact = temp.path().join("plugin.wasm");
        tokio::fs::write(
            &artifact,
            wat::parse_str(r#"(module (func (export "build")))"#)?,
        )
        .await?;
        let functions = serde_json::from_str(
            r#"[{"name":"build","inputFormat":"json","args":[{"name":"src","type":"string","description":"Source directory"},{"name":"verbose","type":"boolean","required":false,"description":"Verbose logging"}],"returnType":"string"}]"#,
        )?;
        let help = artifact_help("demo", &artifact, Some(functions), None, None).await?;
        let text = help.render(Some("build"))?;
        assert!(text.contains("--src <string> [--verbose <boolean>]"));
        assert!(text.contains("--src: string\n    Source directory"));
        assert!(text.contains("--verbose: boolean (optional)"));
        assert!(text.contains("Returns: string"));
        assert!(help.render(None)?.contains("--src: Source directory"));
        Ok(())
    }

    fn metadata() -> Vec<Function> {
        serde_json::from_str(r#"[{"name":"build","description":"Build the project","args":[{"name":"directory","type":"String","description":"Project source directory"}],"returnType":"Effect String"},{"name":"clean","args":[],"description":"Remove build outputs"}]"#).unwrap()
    }

    #[tokio::test]
    async fn help_inspects_metadata_without_executing_wasm_or_opening_database() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let artifact = temp.path().join("plugin.wasm");
        // Instantiating this module would trap; help only parses its bytes.
        let bytes = wat::parse_str(
            r#"(module (func $trap unreachable) (start $trap) (func (export "build")) (func (export "clean")))"#,
        )?;
        tokio::fs::write(&artifact, bytes).await?;
        let help = artifact_help(
            "demo",
            &artifact,
            Some(metadata()),
            Some("Demo module".into()),
            Some("1.0.0".into()),
        )
        .await?;
        let summary = help.render(None)?;
        assert!(summary.contains("demo (1.0.0)\nDemo module"));
        assert!(summary.contains("build <directory: String> -> Effect String"));
        assert!(summary.contains("Build the project"));
        let details = help.render(Some("build"))?;
        assert!(details.contains("Usage: fluentci run demo build <directory>"));
        assert!(details.contains("directory: String\n    Project source directory"));
        assert!(details.contains("Returns: Effect String"));
        assert!(help.render(Some("clean"))?.contains("No arguments."));
        assert!(
            help.render(Some("missing"))
                .unwrap_err()
                .to_string()
                .contains("not found")
        );
        let cli = Cli::try_parse_from([
            "fluentci",
            "--database",
            artifact.to_str().unwrap(),
            "run",
            artifact.to_str().unwrap(),
            "--help",
        ])?;
        // The database path is an existing Wasm file, so opening SQLite would fail.
        crate::commands::dispatch(cli).await?;
        Ok(())
    }

    #[tokio::test]
    async fn missing_source_metadata_does_not_invent_arguments_or_descriptions() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let artifact = temp.path().join("plugin.wasm");
        tokio::fs::write(
            &artifact,
            wat::parse_str(
                r#"(module (func (export "build") (param i64) (result i32) i32.const 0))"#,
            )?,
        )
        .await?;
        let help = artifact_help("legacy", &artifact, None, None, None).await?;
        let details = help.render(Some("build"))?;
        assert!(details.contains("build [args...]"));
        assert!(
            details.contains("Source argument names, types, and descriptions are unavailable.")
        );
        assert!(!details.contains("No arguments."));
        assert!(!details.contains("Returns:"));
        Ok(())
    }

    #[tokio::test]
    async fn embedded_sdk_metadata_is_used_for_direct_wasm_help() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let artifact = temp.path().join("plugin.wasm");
        let manifest = serde_json::json!({ "functions": metadata() }).to_string();
        let encoded: String = manifest
            .bytes()
            .map(|byte| format!("\\{byte:02x}"))
            .collect();
        let wasm = wat::parse_str(format!(
            r#"(module (@custom "fluentci:metadata" "{encoded}") (func (export "build")) (func (export "clean")))"#
        ))?;
        tokio::fs::write(&artifact, wasm).await?;
        let help = artifact_help("sdk", &artifact, None, None, None).await?;
        let details = help.render(Some("build"))?;
        assert!(details.contains("Build the project"));
        assert!(details.contains("Project source directory"));
        assert!(details.contains("Returns: Effect String"));
        Ok(())
    }

    #[test]
    fn untrusted_metadata_cannot_inject_terminal_escape_sequences() {
        assert_eq!(text("hello\u{1b}[31m\u{7}"), "hello[31m");
    }

    #[test]
    fn registry_help_metadata_must_match_the_pinned_artifact() -> Result<()> {
        let mut locked = registry::Resolved {
            name: "demo@latest".into(),
            version: "1.0.0".into(),
            metadata: registry::Package {
                name: Some("demo".into()),
                author: Some("did:plc:publisher".into()),
                sha256: Some("a".repeat(64)),
                ..Default::default()
            },
        };
        for mismatch in ["version", "author", "name", "checksum", "none", "matching"] {
            let mut published = registry::Resolved {
                name: locked.name.clone(),
                version: locked.version.clone(),
                metadata: locked.metadata.clone(),
            };
            published.metadata.functions = Some(metadata());
            match mismatch {
                "version" => published.version = "2.0.0".into(),
                "author" => published.metadata.author = Some("did:plc:other".into()),
                "name" => published.metadata.name = Some("other".into()),
                "checksum" => published.metadata.sha256 = Some("b".repeat(64)),
                "none" => published.metadata.sha256 = None,
                _ => {}
            }
            let result = crate::plugin_metadata::apply_published_metadata(&mut locked, published);
            assert_eq!(result.is_ok(), mismatch == "matching");
        }
        assert_eq!(locked.metadata.functions.unwrap()[0].name, "build");
        Ok(())
    }
}
