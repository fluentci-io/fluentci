//! Build-time signature inspection; never loads or executes a plugin.

use anyhow::{bail, ensure, Context, Result};
use quote::ToTokens;
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path};
use syn::{Attribute, Fields, FnArg, GenericArgument, Item, PathArguments, ReturnType, Type};

fn docs(attributes: &[Attribute]) -> String {
    attributes
        .iter()
        .filter_map(|attribute| {
            if !attribute.path().is_ident("doc") {
                return None;
            }
            if let syn::Meta::NameValue(value) = &attribute.meta {
                if let syn::Expr::Lit(value) = &value.value {
                    if let syn::Lit::Str(value) = &value.lit {
                        return Some(value.value().trim().to_owned());
                    }
                }
            }
            None
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn unconditional(attributes: &[Attribute]) -> Result<()> {
    ensure!(
        attributes
            .iter()
            .all(|value| !value.path().is_ident("cfg") && !value.path().is_ident("cfg_attr")),
        "Conditional export/input declarations require an explicit compiler adapter"
    );
    Ok(())
}

fn head(ty: &Type) -> Result<(String, Vec<&Type>)> {
    let Type::Path(path) = ty else {
        bail!("CLI inputs require concrete owned Rust types");
    };
    let segment = path.path.segments.last().context("Missing Rust type")?;
    let parameters = match &segment.arguments {
        PathArguments::None => vec![],
        PathArguments::AngleBracketed(arguments) => arguments
            .args
            .iter()
            .map(|argument| {
                if let GenericArgument::Type(ty) = argument {
                    Ok(ty)
                } else {
                    bail!("Unsupported Rust type parameter")
                }
            })
            .collect::<Result<_>>()?,
        _ => bail!("Unsupported Rust input type"),
    };
    Ok((segment.ident.to_string(), parameters))
}

fn wire(ty: &Type) -> Result<(String, bool)> {
    let (name, parameters) = head(ty)?;
    match (name.as_str(), parameters.as_slice()) {
        ("String", []) => Ok(("string".into(), false)),
        ("bool", []) => Ok(("boolean".into(), false)),
        ("i32", []) => Ok(("integer".into(), false)),
        ("f64" | "f32", []) => Ok(("number".into(), false)),
        ("Option", [inner]) => {
            let (kind, optional) = wire(inner)?;
            ensure!(!optional, "Nested Rust options require an explicit codec");
            Ok((kind, true))
        }
        ("Vec", [inner]) => {
            let (kind, optional) = wire(inner)?;
            ensure!(
                !optional && !kind.ends_with("[]"),
                "Nested/optional list elements require an explicit codec"
            );
            Ok((format!("{kind}[]"), false))
        }
        _ => bail!("Unsupported Rust CLI field {}", ty.to_token_stream()),
    }
}

fn serde_fields(attributes: &[Attribute], original: &str) -> Result<(String, bool)> {
    let mut name = original.to_owned();
    let mut default = false;
    for attribute in attributes
        .iter()
        .filter(|value| value.path().is_ident("serde"))
    {
        attribute.parse_nested_meta(|meta| {
            if meta.path.is_ident("rename") { name = meta.value()?.parse::<syn::LitStr>()?.value(); }
            else if meta.path.is_ident("default") {
                default = true;
                if meta.input.peek(syn::Token![=]) { let _: syn::LitStr = meta.value()?.parse()?; }
            } else { return Err(meta.error("CLI input records support serde rename/default; flatten and custom codecs require an explicit adapter")); }
            Ok(())
        })?;
    }
    ensure!(
        name != "help"
            && name.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')),
        "Invalid Rust named input field {name}"
    );
    Ok((name, default))
}

pub fn inspect(source: &str) -> Result<Vec<Value>> {
    let syntax = syn::parse_file(source)?;
    let records: BTreeMap<_, _> = syntax
        .items
        .iter()
        .filter_map(|item| {
            if let Item::Struct(item) = item {
                Some((item.ident.to_string(), item))
            } else {
                None
            }
        })
        .collect();
    let aliases: BTreeMap<_, _> = syntax
        .items
        .iter()
        .filter_map(|item| {
            if let Item::Type(item) = item {
                Some((item.ident.to_string(), item.ty.as_ref()))
            } else {
                None
            }
        })
        .collect();
    let mut functions = vec![];
    for item in &syntax.items {
        let Item::Fn(function) = item else {
            continue;
        };
        if !function.attrs.iter().any(|attribute| {
            attribute
                .path()
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "plugin_fn")
        }) {
            continue;
        }
        unconditional(&function.attrs)?;
        ensure!(
            function.sig.asyncness.is_none() && function.sig.generics.params.is_empty(),
            "Guest exports must be synchronous concrete functions"
        );
        let returned = match &function.sig.output {
            ReturnType::Default => "()".to_owned(),
            ReturnType::Type(_, ty) => ty.to_token_stream().to_string(),
        };
        let mut metadata =
            json!({ "name": function.sig.ident.to_string(), "returnType": returned });
        let description = docs(&function.attrs);
        if !description.is_empty() {
            metadata["description"] = description.into();
        }
        match function.sig.inputs.len() {
            0 => {}
            1 => {
                let FnArg::Typed(input) = &function.sig.inputs[0] else {
                    bail!("Guest exports cannot have self parameters");
                };
                let (name, parameters) = head(&input.ty)?;
                // Legacy raw input stays raw. Its semantic fields cannot be inferred.
                if name == "String" && parameters.is_empty() {
                    functions.push(metadata);
                    continue;
                }
                ensure!(
                    name == "Json" && parameters.len() == 1,
                    "Typed exports must accept Json<Args>"
                );
                let mut record_type = parameters[0];
                let mut visited = vec![];
                let record_name = loop {
                    let (name, parameters) = head(record_type)?;
                    ensure!(
                        parameters.is_empty() && !visited.contains(&name),
                        "Input records must be concrete, nonrecursive types"
                    );
                    if let Some(alias) = aliases.get(&name) {
                        visited.push(name);
                        record_type = alias;
                    } else {
                        break name;
                    }
                };
                let record = records
                    .get(&record_name)
                    .context("Json input must name a local concrete struct")?;
                unconditional(&record.attrs)?;
                ensure!(
                    record
                        .attrs
                        .iter()
                        .all(|value| !value.path().is_ident("serde")),
                    "Record-level serde transforms require an explicit adapter"
                );
                let Fields::Named(fields) = &record.fields else {
                    bail!("Json input must have named struct fields");
                };
                let mut args = vec![];
                for member in &fields.named {
                    unconditional(&member.attrs)?;
                    let original = member
                        .ident
                        .as_ref()
                        .context("Unnamed input field")?
                        .to_string();
                    let (name, default) = serde_fields(&member.attrs, &original)?;
                    let (kind, optional) = wire(&member.ty)?;
                    let mut argument = json!({ "name": name, "type": kind });
                    if optional || default {
                        argument["required"] = false.into();
                    }
                    let description = docs(&member.attrs);
                    if !description.is_empty() {
                        argument["description"] = description.into();
                    }
                    args.push(argument);
                }
                metadata["inputFormat"] = "json".into();
                metadata["args"] = args.into();
            }
            _ => bail!("Guest exports accept one Json<Args> record"),
        }
        functions.push(metadata);
    }
    Ok(functions)
}

/// Emit a custom section from the source Cargo is about to compile.
pub fn generate(manifest: &Path, output: &Path) -> Result<()> {
    let source = manifest.join("src/lib.rs");
    println!("cargo:rerun-if-changed={}", source.display());
    let functions = inspect(&std::fs::read_to_string(&source)?)?;
    let json = serde_json::to_vec(&json!({ "functions": functions }))?;
    ensure!(
        json.len() <= 256 * 1024,
        "Function metadata exceeds 256 KiB"
    );
    let bytes = json.iter().map(u8::to_string).collect::<Vec<_>>().join(",");
    std::fs::write(output.join("fluentci_metadata.rs"), format!("#[used]\n#[cfg_attr(target_arch = \"wasm32\", link_section = \"fluentci:metadata\")]\nstatic FLUENTCI_METADATA: [u8; {}] = [{bytes}];\n", json.len()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_edits_change_the_generated_signature() -> Result<()> {
        let source = r#"
struct Args { /// Source directory.
src: String, jobs: i32, verbose: Option<bool> }
/// Build source files.
#[plugin_fn] pub fn build(args: Json<Args>) -> FnResult<String> { todo!() }
"#;
        let functions = inspect(source)?;
        assert_eq!(functions[0]["args"][0]["description"], "Source directory.");
        assert_eq!(functions[0]["args"][1]["type"], "integer");
        assert_eq!(functions[0]["args"][2]["required"], false);
        assert_eq!(
            inspect(&source.replace("jobs: i32", "jobs: f64"))?[0]["args"][1]["type"],
            "number"
        );
        assert!(inspect(&source.replace("jobs: i32", "jobs: usize")).is_err());
        Ok(())
    }
}
