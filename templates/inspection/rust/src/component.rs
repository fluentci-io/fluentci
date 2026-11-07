//! Generate WIT and guest adapters from the same typed Rust jobs being compiled.

use crate::{docs, head, unconditional};
use anyhow::{bail, ensure, Context, Result};
use quote::ToTokens;
use std::{collections::BTreeMap, path::Path};
use syn::{Fields, FnArg, Item, Pat, ReturnType, Type, Visibility};

fn name(value: &str) -> Result<String> {
    let value = value.strip_prefix("r#").unwrap_or(value);
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if ch.is_uppercase() && index > 0 {
            result.push('-');
        }
        result.push(if ch == '_' {
            '-'
        } else {
            ch.to_ascii_lowercase()
        });
    }
    ensure!(
        result
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic)
            && result
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'),
        "Unsupported WIT identifier {value}"
    );
    Ok(result)
}

fn comment(text: &str) -> String {
    text.lines().map(|line| format!("/// {line}\n")).collect()
}

struct Generator<'a> {
    records: BTreeMap<String, &'a syn::ItemStruct>,
}

impl Generator<'_> {
    fn ty(&self, ty: &Type) -> Result<String> {
        if let Type::Tuple(tuple) = ty {
            if tuple.elems.is_empty() {
                return Ok("_".into());
            }
            return Ok(format!(
                "tuple<{}>",
                tuple
                    .elems
                    .iter()
                    .map(|ty| self.ty(ty))
                    .collect::<Result<Vec<_>>>()?
                    .join(", ")
            ));
        }
        let (head, parameters) = head(ty)?;
        let scalar = match head.as_str() {
            "String" => Some("string"),
            "bool" => Some("bool"),
            "char" => Some("char"),
            "u8" => Some("u8"),
            "u16" => Some("u16"),
            "u32" => Some("u32"),
            "u64" => Some("u64"),
            "i8" => Some("s8"),
            "i16" => Some("s16"),
            "i32" => Some("s32"),
            "i64" => Some("s64"),
            "f32" => Some("f32"),
            "f64" => Some("f64"),
            _ => None,
        };
        if let Some(scalar) = scalar {
            ensure!(parameters.is_empty(), "Concrete component scalar required");
            return Ok(scalar.into());
        }
        match (head.as_str(),parameters.as_slice()) {
            ("Option",[ty])=>Ok(format!("option<{}>",self.ty(ty)?)),
            ("Vec",[ty])=>Ok(format!("list<{}>",self.ty(ty)?)),
            ("Result",[ok,err])=>Ok(format!("result<{}, {}>",self.ty(ok)?,self.ty(err)?)),
            _ if parameters.is_empty() && self.records.contains_key(&head)=>name(&head),
            _=>bail!("Unsupported component source type {}; use concrete owned records, scalars, Option, Vec, Result, or tuples",ty.to_token_stream()),
        }
    }

    fn rust_ty(&self, ty: &Type, native: bool) -> Result<String> {
        if let Type::Tuple(tuple) = ty {
            return Ok(format!(
                "({})",
                tuple
                    .elems
                    .iter()
                    .map(|ty| self.rust_ty(ty, native))
                    .collect::<Result<Vec<_>>>()?
                    .join(",")
            ));
        }
        let (head, parameters) = head(ty)?;
        let prefix = if self.records.contains_key(&head) {
            if native {
                "jobs::"
            } else {
                "exports::fluentci::module::api::"
            }
        } else {
            ""
        };
        Ok(format!(
            "{prefix}{head}{}",
            if parameters.is_empty() {
                String::new()
            } else {
                format!(
                    "<{}>",
                    parameters
                        .iter()
                        .map(|ty| self.rust_ty(ty, native))
                        .collect::<Result<Vec<_>>>()?
                        .join(",")
                )
            }
        ))
    }

    fn convert(&self, ty: &Type, value: &str, native: bool, depth: usize) -> Result<String> {
        ensure!(depth < 64, "Recursive component records are not supported");
        if let Type::Tuple(tuple) = ty {
            return Ok(format!(
                "({})",
                tuple
                    .elems
                    .iter()
                    .enumerate()
                    .map(|(index, ty)| self.convert(
                        ty,
                        &format!("{value}.{index}"),
                        native,
                        depth + 1
                    ))
                    .collect::<Result<Vec<_>>>()?
                    .into_iter()
                    .map(|value| value + ",")
                    .collect::<String>()
            ));
        }
        let (head, parameters) = head(ty)?;
        if let Some(record) = self.records.get(&head) {
            let Fields::Named(fields) = &record.fields else {
                bail!("Component records need named fields");
            };
            let members = fields
                .named
                .iter()
                .map(|field| {
                    let identifier = field.ident.as_ref().context("Unnamed field")?;
                    let expression = self.convert(
                        &field.ty,
                        &format!("{value}.{identifier}"),
                        native,
                        depth + 1,
                    )?;
                    Ok(format!("{identifier}:{expression}"))
                })
                .collect::<Result<Vec<_>>>()?;
            return Ok(format!(
                "{} {{ {} }}",
                self.rust_ty(ty, native)?,
                members.join(",")
            ));
        }
        Ok(match (head.as_str(), parameters.as_slice()) {
            ("Option", [ty]) => format!(
                "{value}.map(|value| {})",
                self.convert(ty, "value", native, depth + 1)?
            ),
            ("Vec", [ty]) => format!(
                "{value}.into_iter().map(|value| {}).collect()",
                self.convert(ty, "value", native, depth + 1)?
            ),
            ("Result", [ok, err]) => format!(
                "{value}.map(|value| {}).map_err(|value| {})",
                self.convert(ok, "value", native, depth + 1)?,
                self.convert(err, "value", native, depth + 1)?
            ),
            _ => value.into(),
        })
    }
}

pub fn generate_component(manifest: &Path, output: &Path, host_wit: &str) -> Result<()> {
    let source = manifest.join("src/jobs.rs");
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed=.sdk/wit/runtime.wit");
    let source = syn::parse_file(&std::fs::read_to_string(source)?)?;
    let generator = Generator {
        records: source
            .items
            .iter()
            .filter_map(|item| {
                if let Item::Struct(record) = item {
                    Some((record.ident.to_string(), record))
                } else {
                    None
                }
            })
            .collect(),
    };
    let mut interface = String::from("package fluentci:module@0.1.0;\n\ninterface api {\n");
    for record in generator.records.values() {
        unconditional(&record.attrs)?;
        ensure!(
            record.generics.params.is_empty(),
            "Component records must be concrete"
        );
        let Fields::Named(fields) = &record.fields else {
            bail!("Component structs need named fields");
        };
        interface.push_str(&comment(&docs(&record.attrs)));
        interface.push_str(&format!("record {} {{\n", name(&record.ident.to_string())?));
        for field in &fields.named {
            unconditional(&field.attrs)?;
            ensure!(
                !matches!(field.vis, Visibility::Inherited),
                "Component record fields must be public"
            );
            interface.push_str(&comment(&docs(&field.attrs)));
            interface.push_str(&format!(
                "{}: {},\n",
                name(&field.ident.as_ref().context("Unnamed field")?.to_string())?,
                generator.ty(&field.ty)?
            ));
        }
        interface.push_str("}\n");
    }
    let mut implementations = String::new();
    let mut exports = 0;
    let mut documentation = Vec::new();
    for item in &source.items {
        let Item::Fn(function) = item else {
            continue;
        };
        if matches!(function.vis, Visibility::Inherited) {
            continue;
        }
        unconditional(&function.attrs)?;
        ensure!(
            function.sig.asyncness.is_none() && function.sig.generics.params.is_empty(),
            "Component exports must have concrete synchronous signatures"
        );
        let identifier = &function.sig.ident;
        let mut argument_docs = Vec::new();
        for parameter in &function.sig.inputs {
            if let FnArg::Typed(parameter) = parameter {
                if let Pat::Ident(binding) = parameter.pat.as_ref() {
                    argument_docs.push(serde_json::json!({"name":name(&binding.ident.to_string())?,"description":docs(&parameter.attrs)}));
                }
            }
        }
        if let [FnArg::Typed(parameter)] = function.sig.inputs.iter().collect::<Vec<_>>().as_slice()
        {
            if let Ok((ty, _)) = head(&parameter.ty) {
                if let Some(record) = generator.records.get(&ty) {
                    argument_docs = record.fields.iter().map(|field| Ok(serde_json::json!({"name":name(&field.ident.as_ref().context("Unnamed field")?.to_string())?,"description":docs(&field.attrs)}))).collect::<Result<Vec<_>>>()?;
                }
            }
        }
        documentation.push(serde_json::json!({"name":format!("fluentci:module/api@0.1.0#{}",name(&identifier.to_string())?),"description":docs(&function.attrs),"args":argument_docs}));
        let mut parameters = vec![];
        let mut rust_parameters = vec![];
        let mut arguments = vec![];
        for parameter in &function.sig.inputs {
            let FnArg::Typed(parameter) = parameter else {
                bail!("Exports cannot have self parameters");
            };
            let Pat::Ident(binding) = parameter.pat.as_ref() else {
                bail!("Use named component parameters");
            };
            let identifier = &binding.ident;
            parameters.push(format!(
                "{}: {}",
                name(&identifier.to_string())?,
                generator.ty(&parameter.ty)?
            ));
            rust_parameters.push(format!(
                "{identifier}: {}",
                generator.rust_ty(&parameter.ty, false)?
            ));
            arguments.push(generator.convert(&parameter.ty, &identifier.to_string(), true, 0)?);
        }
        let call = format!("jobs::{identifier}({})", arguments.join(","));
        let (wit_return, rust_return, body) = match &function.sig.output {
            ReturnType::Default => (String::new(), String::new(), format!("{call};")),
            ReturnType::Type(_, ty) if matches!(ty.as_ref(),Type::Tuple(tuple) if tuple.elems.is_empty()) => {
                (String::new(), String::new(), format!("{call};"))
            }
            ReturnType::Type(_, ty) => (
                format!(" -> {}", generator.ty(ty)?),
                format!(" -> {}", generator.rust_ty(ty, false)?),
                format!(
                    "let result={call};{}",
                    generator.convert(ty, "result", false, 0)?
                ),
            ),
        };
        interface.push_str(&comment(&docs(&function.attrs)));
        interface.push_str(&format!(
            "{}: func({}){wit_return};\n",
            name(&identifier.to_string())?,
            parameters.join(",")
        ));
        implementations.push_str(&format!(
            "fn {identifier}({}){rust_return} {{ {body} }}\n",
            rust_parameters.join(",")
        ));
        exports += 1;
    }
    ensure!(
        exports > 0,
        "Expose at least one public function from src/jobs.rs"
    );
    interface
        .push_str("}\n\nworld plugin {\nimport fluentci:runtime/host@0.1.0;\nimport fluentci:runtime/api@0.1.0;\nexport api;\n}\n");
    let wit = output.join("wit");
    std::fs::create_dir_all(wit.join("deps/fluentci-runtime"))?;
    std::fs::write(wit.join("module.wit"), interface)?;
    std::fs::write(wit.join("deps/fluentci-runtime/runtime.wit"), host_wit)?;
    let bindings=format!("wit_bindgen::generate!({{ path: {}, world: \"plugin\", generate_all }});\nstruct Component;\nimpl exports::fluentci::module::api::Guest for Component {{\n{implementations}\n}}\nexport!(Component);\n",serde_json::to_string(&wit.to_string_lossy())?);
    let metadata = serde_json::to_vec(&serde_json::json!({"functions":documentation}))?;
    ensure!(
        metadata.len() <= 256 * 1024,
        "Component documentation exceeds 256 KiB"
    );
    std::fs::write(output.join("fluentci.component-docs.json"), &metadata)?;
    let encoded = metadata
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let bindings = format!("{bindings}\n#[used]\n#[cfg_attr(target_arch = \"wasm32\", link_section = \"fluentci:component-docs\")]\nstatic FLUENTCI_COMPONENT_DOCS: [u8; {}] = [{encoded}];\n", metadata.len());
    std::fs::write(output.join("component.rs"), bindings)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wit_and_adapters_follow_source_field_types_and_docs() -> Result<()> {
        let root = tempfile::tempdir()?;
        let output = root.path().join("output");
        std::fs::create_dir_all(root.path().join("src"))?;
        let source = "pub struct Args { /// Source directory.\n pub src: String, pub jobs: u32 }\n/// Build a project.\npub fn build(args: Args) -> Result<String, String> { todo!() }\n";
        let file = root.path().join("src/jobs.rs");
        std::fs::write(&file, source)?;
        let host = "package fluentci:runtime@0.1.0; interface host {} interface api {}";
        generate_component(root.path(), &output, host)?;
        let mut resolve = wit_parser::Resolve::default();
        resolve.push_dir(output.join("wit"))?;
        let wit = std::fs::read_to_string(output.join("wit/module.wit"))?;
        assert!(wit.contains("jobs: u32"));
        assert!(wit.contains("/// Source directory."));
        assert!(wit.contains("build: func(args: args) -> result<string, string>"));
        let bindings = std::fs::read_to_string(output.join("component.rs"))?;
        assert!(bindings.contains("jobs::build(jobs::Args"));
        assert!(!bindings.contains("extism"));
        std::fs::write(file, source.replace("jobs: u32", "jobs: u64"))?;
        generate_component(root.path(), &output, host)?;
        assert!(std::fs::read_to_string(output.join("wit/module.wit"))?.contains("jobs: u64"));
        Ok(())
    }
}
