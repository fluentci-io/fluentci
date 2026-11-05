//! SDK-independent job metadata, verified against the published Wasm exports.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path};
use wasmparser::{ExternalKind, Parser, Payload, TypeRef};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Argument {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Function {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<Argument>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub wasm_params: Vec<String>,
    #[serde(default)]
    pub wasm_results: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    functions: Vec<Function>,
    #[serde(default)]
    sha256: Option<String>,
}

fn manifest(bytes: &[u8], wasm: &[u8]) -> Result<Vec<Function>> {
    anyhow::ensure!(
        bytes.len() <= 256 * 1024,
        "Function metadata exceeds 256 KiB"
    );
    let value: Manifest =
        serde_json::from_slice(bytes).context("Invalid function metadata manifest")?;
    if let Some(digest) = value.sha256 {
        anyhow::ensure!(
            digest == sha256::digest(wasm),
            "Function metadata checksum does not match the Wasm artifact"
        );
    }
    Ok(value.functions)
}

pub fn read_manifest(path: &Path, wasm: &[u8]) -> Result<Vec<Function>> {
    let bytes = std::fs::read(path).with_context(|| format!("Reading {}", path.display()))?;
    manifest(&bytes, wasm)
}

pub fn inspect(wasm: &[u8], declared: Option<Vec<Function>>) -> Result<Vec<Function>> {
    let mut types = Vec::new();
    let mut indices = Vec::new();
    let mut exports = Vec::new();
    let mut embedded = None;
    for payload in Parser::new(0).parse_all(wasm) {
        match payload? {
            Payload::TypeSection(section) => {
                for function in section.into_iter_err_on_gc_types() {
                    types.push(function?);
                }
            }
            Payload::ImportSection(section) => {
                for import in section {
                    if let TypeRef::Func(index) = import?.ty {
                        indices.push(index);
                    }
                }
            }
            Payload::FunctionSection(section) => {
                for index in section {
                    indices.push(index?);
                }
            }
            Payload::ExportSection(section) => {
                for export in section {
                    let export = export?;
                    if export.kind == ExternalKind::Func {
                        exports.push((export.name.to_owned(), export.index));
                    }
                }
            }
            Payload::CustomSection(section) if section.name() == "fluentci:metadata" => {
                anyhow::ensure!(embedded.is_none(), "Duplicate fluentci:metadata sections");
                embedded = Some(manifest(section.data(), wasm)?);
            }
            _ => {}
        }
    }
    let names = crate::modules::functions(wasm)?;
    let declared = declared.or(embedded).unwrap_or_default();
    anyhow::ensure!(
        declared.len() <= 256,
        "Too many declared functions (maximum 256)"
    );
    let mut seen = HashSet::new();
    for function in &declared {
        anyhow::ensure!(
            names.contains(&function.name),
            "Metadata references non-exported function {:?}",
            function.name
        );
        anyhow::ensure!(
            seen.insert(&function.name),
            "Duplicate function metadata {:?}",
            function.name
        );
        anyhow::ensure!(function.name.len() <= 256, "Function name is too long");
        if let Some(description) = &function.description {
            anyhow::ensure!(
                description.chars().count() <= 2048,
                "Function description is too long"
            );
        }
        if let Some(returns) = &function.return_type {
            anyhow::ensure!(
                !returns.trim().is_empty() && returns.chars().count() <= 1024,
                "Invalid return type"
            );
        }
        if let Some(args) = &function.args {
            anyhow::ensure!(args.len() <= 64, "Too many function arguments");
            let mut names = HashSet::new();
            for arg in args {
                anyhow::ensure!(
                    !arg.name.trim().is_empty()
                        && arg.name.chars().count() <= 128
                        && names.insert(&arg.name),
                    "Invalid or duplicate argument name"
                );
                anyhow::ensure!(
                    !arg.type_name.trim().is_empty() && arg.type_name.chars().count() <= 1024,
                    "Invalid argument type"
                );
                if let Some(description) = &arg.description {
                    anyhow::ensure!(
                        description.chars().count() <= 2048,
                        "Argument description is too long"
                    );
                }
            }
        }
    }
    let mut result = Vec::new();
    for (name, index) in exports {
        if !names.contains(&name) {
            continue;
        }
        let index = *indices
            .get(index as usize)
            .context("Invalid Wasm function index")?;
        let ty = types
            .get(index as usize)
            .context("Invalid Wasm function type")?;
        let mut function = declared
            .iter()
            .find(|function| function.name == name)
            .cloned()
            .unwrap_or(Function {
                name,
                args: None,
                return_type: None,
                description: None,
                wasm_params: vec![],
                wasm_results: vec![],
            });
        // ABI data always comes from the artifact, never caller declarations.
        function.wasm_params = ty.params().iter().map(ToString::to_string).collect();
        function.wasm_results = ty.results().iter().map(ToString::to_string).collect();
        result.push(function);
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_is_verified_against_real_exports_and_abi() -> Result<()> {
        let wasm = wat::parse_str(
            r#"(module (import "host" "log" (func (param i32))) (func (export "build") (param i64) (result i32) i32.const 0))"#,
        )?;
        let functions = inspect(&wasm, None)?;
        assert_eq!(functions[0].name, "build");
        assert_eq!(functions[0].wasm_params, ["i64"]);
        assert_eq!(functions[0].wasm_results, ["i32"]);
        assert!(functions[0].args.is_none());
        let declared = manifest(br#"{"functions":[{"name":"build","args":[{"name":"directory","type":"String"}],"returnType":"Effect String","wasmParams":["fake"]}]}"#, &wasm)?;
        let functions = inspect(&wasm, Some(declared))?;
        assert_eq!(functions[0].args.as_ref().unwrap()[0].name, "directory");
        assert_eq!(functions[0].wasm_params, ["i64"]);
        assert_eq!(functions[0].return_type.as_deref(), Some("Effect String"));
        let wrong = manifest(br#"{"functions":[{"name":"missing"}]}"#, &wasm)?;
        assert!(inspect(&wasm, Some(wrong)).is_err());
        assert!(manifest(br#"{"functions":[],"sha256":"wrong"}"#, &wasm).is_err());
        Ok(())
    }
}
