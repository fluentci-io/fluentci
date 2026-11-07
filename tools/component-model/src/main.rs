//! Inspect the real serializable executor declarations without running user code.
use anyhow::{bail, Context, Result};
use quote::ToTokens;
use serde_json::{json, Map, Value};
use std::{collections::BTreeMap, path::Path};
use syn::{Attribute, Fields, GenericArgument, Item, PathArguments, Type};

fn attrs(attributes: &[Attribute]) -> Result<Value> {
    let mut result = Map::new();
    for attribute in attributes
        .iter()
        .filter(|attribute| attribute.path().is_ident("serde"))
    {
        attribute.parse_nested_meta(|meta| {
            let key = meta.path.to_token_stream().to_string();
            if meta.input.peek(syn::Token![=]) {
                let value: syn::LitStr = meta.value()?.parse()?;
                result.insert(key, json!(value.value()));
            } else {
                result.insert(key, json!(true));
            }
            Ok(())
        })?;
    }
    Ok(Value::Object(result))
}

fn ty(ty: &Type) -> Result<Value> {
    if let Type::Tuple(tuple) = ty {
        return Ok(json!({"tuple":tuple.elems.iter().map(self::ty).collect::<Result<Vec<_>>>()?}));
    }
    let Type::Path(path) = ty else {
        bail!(
            "Unsupported serializable source type {}",
            ty.to_token_stream()
        );
    };
    let names = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let last = path.path.segments.last().context("Empty type")?;
    let arguments = match &last.arguments {
        PathArguments::AngleBracketed(arguments) => arguments
            .args
            .iter()
            .map(|argument| match argument {
                GenericArgument::Type(value) => self::ty(value),
                _ => bail!("Concrete model type required"),
            })
            .collect::<Result<Vec<_>>>()?,
        PathArguments::None => vec![],
        _ => bail!("Unsupported source arguments"),
    };
    Ok(json!({"path":names.join("::"),"arguments":arguments}))
}

fn fields(fields: &Fields) -> Result<Value> {
    match fields {
        Fields::Named(fields) => Ok(
            json!({"record":fields.named.iter().map(|field|Ok(json!({"name":field.ident.as_ref().context("Unnamed field")?.to_string(),"type":ty(&field.ty)?,"serde":attrs(&field.attrs)?}))).collect::<Result<Vec<_>>>()?}),
        ),
        Fields::Unnamed(fields) => Ok(
            json!({"tuple":fields.unnamed.iter().map(|field|ty(&field.ty)).collect::<Result<Vec<_>>>()?}),
        ),
        Fields::Unit => Ok(json!({"unit":true})),
    }
}

fn main() -> Result<()> {
    let root = std::env::args()
        .nth(1)
        .context("Usage: fluentci-component-model REPOSITORY OUTPUT")?;
    let output = std::env::args().nth(2).context("Missing output")?;
    let root = Path::new(&root);
    let engine = if root.join("engine/crates").is_dir() {
        root.join("engine")
    } else {
        root.to_path_buf()
    };
    let mut models = BTreeMap::new();
    for (module, file) in [
        ("executor", "lib"),
        ("files", "files"),
        ("packages", "packages"),
        ("cache", "cache"),
        ("service", "service"),
        ("workflow", "workflow"),
        ("workspace", "workspace"),
        ("primitive", "@primitive"),
    ] {
        let file = if file == "@primitive" {
            engine.join("crates/primitives/src/lib.rs")
        } else {
            engine.join(format!("crates/executor/src/{file}.rs"))
        };
        let source = syn::parse_file(&std::fs::read_to_string(file)?)?;
        for item in source.items {
            let (name, attributes, shape) = match item {
                Item::Struct(value) if matches!(value.vis, syn::Visibility::Public(_)) => {
                    (value.ident.to_string(), value.attrs, fields(&value.fields)?)
                }
                Item::Enum(value) if matches!(value.vis, syn::Visibility::Public(_)) => (
                    value.ident.to_string(),
                    value.attrs,
                    json!({"variants":value.variants.iter().map(|variant|Ok(json!({"name":variant.ident.to_string(),"serde":attrs(&variant.attrs)?,"shape":fields(&variant.fields)?}))).collect::<Result<Vec<_>>>()?}),
                ),
                _ => continue,
            };
            let serializable = attributes.iter().any(|attribute| {
                attribute.path().is_ident("derive")
                    && attribute
                        .meta
                        .to_token_stream()
                        .to_string()
                        .contains("Serialize")
            });
            if serializable {
                models.insert(
                    format!("{module}::{name}"),
                    json!({"module":module,"name":name,"serde":attrs(&attributes)?,"shape":shape}),
                );
            }
        }
    }
    save_or_check(Path::new(&output), &serde_json::to_value(models)?)?;
    let names: Value =
        serde_json::from_str(&std::fs::read_to_string(engine.join("schema/host.json"))?)?;
    let operations = names["imports"]
        .as_object()
        .context("Missing host imports")?;
    let source = syn::parse_file(&std::fs::read_to_string(
        engine.join("crates/common/src/host.rs"),
    )?)?;
    let mut abi = BTreeMap::new();
    for item in source.items {
        let Item::Fn(function) = item else {
            continue;
        };
        let name = function.sig.ident.to_string();
        if !operations.contains_key(&name) {
            continue;
        }
        anyhow::ensure!(
            function.sig.inputs.len() <= 2,
            "Host imports require at most one payload"
        );
        let argument = function
            .sig
            .inputs
            .iter()
            .nth(1)
            .map(|argument| match argument {
                syn::FnArg::Typed(argument) => Ok(compact_type(&argument.ty)),
                _ => bail!("Host imports cannot use self"),
            })
            .transpose()?;
        let syn::ReturnType::Type(_, result) = &function.sig.output else {
            bail!("Host imports must return Result");
        };
        let Type::Path(result) = result.as_ref() else {
            bail!("Expected Result");
        };
        let PathArguments::AngleBracketed(arguments) = &result
            .path
            .segments
            .last()
            .context("Empty result")?
            .arguments
        else {
            bail!("Expected Result arguments");
        };
        let Some(GenericArgument::Type(result)) = arguments.args.first() else {
            bail!("Missing Result payload");
        };
        abi.insert(
            name,
            json!({"argument":argument,"result":compact_type(result)}),
        );
    }
    anyhow::ensure!(
        abi.len() == operations.len(),
        "Host ABI schema and native implementation differ"
    );
    save_or_check(
        &engine.join("schema/host-rust.json"),
        &serde_json::to_value(abi)?,
    )?;
    Ok(())
}

fn compact_type(value: &Type) -> String {
    value
        .to_token_stream()
        .to_string()
        .chars()
        .filter(|value| !value.is_whitespace())
        .collect()
}

fn save_or_check(path: &Path, value: &Value) -> Result<()> {
    let content = serde_json::to_string_pretty(value)? + "\n";
    if std::env::args().any(|arg| arg == "--check") {
        anyhow::ensure!(
            std::fs::read_to_string(path)? == content,
            "Regenerate {} with fluentci-component-model",
            path.display()
        );
    } else {
        std::fs::write(path, content)?;
    }
    Ok(())
}
