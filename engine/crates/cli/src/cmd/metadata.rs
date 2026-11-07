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
    #[serde(default = "required", skip_serializing_if = "is_required")]
    pub required: bool,
}

fn required() -> bool {
    true
}

fn is_required(value: &bool) -> bool {
    *value
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InputFormat {
    #[default]
    Text,
    Json,
}

impl InputFormat {
    fn is_text(&self) -> bool {
        *self == Self::Text
    }
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
    #[serde(
        default,
        alias = "input_format",
        skip_serializing_if = "InputFormat::is_text"
    )]
    pub input_format: InputFormat,
    #[serde(default)]
    pub wasm_params: Vec<String>,
    #[serde(default)]
    pub wasm_results: Vec<String>,
}

#[derive(Serialize, Deserialize)]
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

/// Replace only metadata sections; executable code and all other sections stay intact.
pub fn embed(wasm: &[u8], declared: Vec<Function>) -> Result<Vec<u8>> {
    let functions = inspect(wasm, Some(declared))?;
    let mut output = wasm.to_vec();
    let mut ranges = Vec::new();
    for payload in Parser::new(0).parse_all(wasm) {
        if let Payload::CustomSection(section) = payload? {
            if section.name() == "fluentci:metadata" {
                // range() starts at the custom section name, after its id/length.
                let range = section.range();
                let mut start = range.start - 1;
                while start > 8 && wasm[start - 1] & 0x80 != 0 {
                    start -= 1;
                }
                start -= 1;
                anyhow::ensure!(wasm[start] == 0, "Invalid custom section boundary");
                ranges.push(start..range.end);
            }
        }
    }
    for range in ranges.into_iter().rev() {
        output.drain(range);
    }
    let metadata = serde_json::to_vec(&Manifest {
        functions,
        sha256: None,
    })?;
    anyhow::ensure!(
        metadata.len() <= 256 * 1024,
        "Function metadata exceeds 256 KiB"
    );
    let name = b"fluentci:metadata";
    let mut section = Vec::new();
    leb(name.len(), &mut section);
    section.extend_from_slice(name);
    section.extend(metadata);
    output.push(0);
    leb(section.len(), &mut output);
    output.extend(section);
    inspect(&output, None)?;
    Ok(output)
}

fn leb(mut value: usize, bytes: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 127) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 128;
        }
        bytes.push(byte);
        if value == 0 {
            break;
        }
    }
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
    let names = functions(wasm)?;
    let declared = merge_declarations(embedded.unwrap_or_default(), declared)?;
    anyhow::ensure!(
        declared.len() <= 256,
        "Too many declared functions (maximum 256)"
    );
    let mut seen = HashSet::new();
    for function in &declared {
        super::arguments::validate(function)?;
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
                input_format: InputFormat::Text,
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

fn merge_declarations(
    mut embedded: Vec<Function>,
    declared: Option<Vec<Function>>,
) -> Result<Vec<Function>> {
    let mut seen = HashSet::new();
    for declaration in declared.unwrap_or_default() {
        anyhow::ensure!(
            seen.insert(declaration.name.clone()),
            "Duplicate function metadata {:?}",
            declaration.name
        );
        if let Some(original) = embedded
            .iter_mut()
            .find(|value| value.name == declaration.name)
        {
            if original.input_format == InputFormat::Json {
                let same_args = match (&original.args, &declaration.args) {
                    (Some(left), Some(right)) => {
                        left.len() == right.len()
                            && left.iter().zip(right).all(|(left, right)| {
                                left.name == right.name
                                    && left.type_name == right.type_name
                                    && left.required == right.required
                            })
                    }
                    _ => false,
                };
                anyhow::ensure!(
                    declaration.input_format == original.input_format
                        && declaration.return_type == original.return_type
                        && same_args,
                    "Declared signature for {:?} conflicts with the inspected Wasm contract; rebuild the module from its source",
                    original.name
                );
            }
            *original = declaration;
        } else {
            embedded.push(declaration);
        }
    }
    Ok(embedded)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_contracts_reject_stale_overrides_but_allow_documentation_edits() -> Result<()> {
        let wasm = wat::parse_str(r#"(module (func (export "build")))"#)?;
        let declared = manifest(br#"{"functions":[{"name":"build","inputFormat":"json","args":[{"name":"src","type":"string"}],"returnType":"String"}]}"#, &wasm)?;
        let generated = embed(&wasm, declared.clone())?;
        let mut edited = declared.clone();
        edited[0].description = Some("Updated documentation".into());
        assert_eq!(
            inspect(&generated, Some(edited))?[0].description.as_deref(),
            Some("Updated documentation")
        );
        let mut stale = declared.clone();
        stale[0].args.as_mut().unwrap()[0].type_name = "number".into();
        assert!(inspect(&generated, Some(stale))
            .unwrap_err()
            .to_string()
            .contains("conflicts with the inspected Wasm contract"));
        let mut duplicate = declared.clone();
        duplicate.extend(declared);
        assert!(inspect(&generated, Some(duplicate)).is_err());
        Ok(())
    }

    #[test]
    fn embedding_replaces_only_metadata_and_exposes_typed_named_arguments() -> Result<()> {
        let wasm =
            wat::parse_str(r#"(module (@custom "other" "keep me") (func (export "build")))"#)?;
        let declared = manifest(br#"{"functions":[{"name":"build","inputFormat":"json","description":"Build sources","args":[{"name":"src","type":"string","description":"Source directory"},{"name":"verbose","type":"boolean","required":false}],"returnType":"string"}]}"#, &wasm)?;
        let once = embed(&wasm, declared.clone())?;
        let twice = embed(&once, declared)?;
        assert_eq!(once, twice);
        let functions = inspect(&twice, None)?;
        assert_eq!(functions[0].input_format, InputFormat::Json);
        assert_eq!(functions[0].return_type.as_deref(), Some("string"));
        assert!(!functions[0].args.as_ref().unwrap()[1].required);
        assert!(twice.windows(7).any(|bytes| bytes == b"keep me"));
        assert_eq!(
            super::super::arguments::encode(
                &functions[0],
                &["--src".into(), "demo folder".into()]
            )?,
            r#"{"src":"demo folder"}"#
        );
        Ok(())
    }

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
