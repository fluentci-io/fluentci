//! Type-checked component composition and code-first dependency interface exports.

use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
use wasm_compose::{
    composer::{ComponentComposer, ROOT_COMPONENT_NAME},
    config::{Config, Dependency, Instantiation, InstantiationArg},
};
use wit_component::{DecodedWasm, WitPrinter};
use wit_parser::{FunctionKind, Type, TypeDefKind, WorldItem};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyInterface {
    pub alias: String,
    pub import: String,
    pub export: String,
    pub wit: String,
}

pub fn interface(alias: &str, bytes: &[u8]) -> Result<DependencyInterface> {
    ensure!(
        alias
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-'),
        "Component dependency aliases must use lowercase kebab-case"
    );
    let DecodedWasm::Component(mut resolve, world) = wit_component::decode(bytes)? else {
        anyhow::bail!("Component dependencies must themselves be Wasm components");
    };
    let exports = resolve.worlds[world]
        .exports
        .iter()
        .filter_map(|(key, item)| {
            if let WorldItem::Interface { id, .. } = item {
                Some((resolve.name_world_key(key), *id))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    let (export, id) = exports
        .iter()
        .find(|(_, id)| resolve.interfaces[*id].name.as_deref() == Some("api"))
        .or_else(|| {
            if exports.len() == 1 {
                exports.first()
            } else {
                None
            }
        })
        .context(
            "Dependency must export an unambiguous WIT interface (or an interface named api)",
        )?;
    let export = export.clone();
    let package = resolve.interfaces[*id]
        .package
        .context("Exported interface has no WIT package")?;
    let interface_name = alias.to_owned();
    if let Some(previous) = resolve.interfaces[*id].name.take() {
        resolve.packages[package].interfaces.shift_remove(&previous);
    }
    resolve.interfaces[*id].name = Some(interface_name.clone());
    resolve.packages[package]
        .interfaces
        .insert(interface_name.clone(), *id);
    resolve.packages[package].name.namespace = "fluentci".into();
    resolve.packages[package].name.name = format!("dependency-{alias}");
    // interface_id formats the version after the interface, as required by WIT.
    let import = resolve.packages[package].name.interface_id(&interface_name);
    let mut printer = WitPrinter::default();
    printer.print(&resolve, package, &[])?;
    Ok(DependencyInterface {
        alias: alias.into(),
        import,
        export,
        wit: printer.output.to_string(),
    })
}

pub fn compose(
    root: &Path,
    dependencies: &BTreeMap<String, (PathBuf, DependencyInterface)>,
) -> Result<Vec<u8>> {
    let mut config = Config {
        dir: root
            .parent()
            .context("Missing component directory")?
            .to_owned(),
        ..Default::default()
    };
    let DecodedWasm::Component(resolve, world) = wit_component::decode(&std::fs::read(root)?)?
    else {
        anyhow::bail!("Expected a component");
    };
    let imports = resolve.worlds[world]
        .imports
        .keys()
        .map(|key| resolve.name_world_key(key))
        .collect::<Vec<_>>();
    let mut instantiation = Instantiation::default();
    for (alias, (path, interface)) in dependencies {
        let import = if imports.contains(&interface.import) {
            &interface.import
        } else if imports.contains(alias) {
            alias
        } else {
            continue;
        };
        config
            .dependencies
            .insert(alias.clone(), Dependency { path: path.clone() });
        instantiation.arguments.insert(
            import.clone(),
            InstantiationArg {
                instance: alias.clone(),
                export: Some(interface.export.clone()),
            },
        );
    }
    if instantiation.arguments.is_empty() {
        return std::fs::read(root).map_err(Into::into);
    }
    config
        .instantiations
        .insert(ROOT_COMPONENT_NAME.into(), instantiation);
    ComponentComposer::new(root, &config)
        .compose()
        .context("Module dependency WIT interfaces are incompatible")
}

/// Native ComponentizeJS import declarations, derived from the actual WIT ABI.
pub fn typescript(alias: &str, bytes: &[u8]) -> Result<String> {
    fn camel(value: &str) -> String {
        let mut upper = false;
        value
            .chars()
            .filter_map(|ch| {
                if ch == '-' {
                    upper = true;
                    None
                } else if upper {
                    upper = false;
                    Some(ch.to_ascii_uppercase())
                } else {
                    Some(ch)
                }
            })
            .collect()
    }
    fn ty(resolve: &wit_parser::Resolve, value: Type, depth: usize) -> Result<String> {
        ensure!(depth < 64, "Dependency type nesting exceeds 64");
        Ok(match value {
            Type::Bool=>"boolean".into(),Type::String|Type::Char=>"string".into(),Type::U64|Type::S64=>"bigint".into(),
            Type::U8|Type::S8|Type::U16|Type::S16|Type::U32|Type::S32|Type::F32|Type::F64=>"number".into(),
            Type::Id(id)=>match &resolve.types[id].kind {
                TypeDefKind::Type(value)=>ty(resolve,*value,depth+1)?,
                TypeDefKind::Option(value)=>format!("({} | undefined)",ty(resolve,*value,depth+1)?),
                TypeDefKind::List(Type::U8)=>"Uint8Array".into(),
                TypeDefKind::List(value)=>format!("Array<{}>",ty(resolve,*value,depth+1)?),
                TypeDefKind::Tuple(tuple)=>format!("[{}]",tuple.types.iter().map(|value|ty(resolve,*value,depth+1)).collect::<Result<Vec<_>>>()?.join(", ")),
                TypeDefKind::Record(record)=>format!("{{ {} }}",record.fields.iter().map(|field| {
                    let optional=matches!(field.ty,Type::Id(id) if matches!(resolve.types[id].kind,TypeDefKind::Option(_)));
                    Ok(format!("{}{}: {}",serde_json::to_string(&camel(&field.name))?,if optional{"?"}else{""},ty(resolve,field.ty,depth+1)?))
                }).collect::<Result<Vec<_>>>()?.join("; ")),
                TypeDefKind::Enum(value)=>value.cases.iter().map(|case|serde_json::to_string(&case.name).map_err(Into::into)).collect::<Result<Vec<_>>>()?.join(" | "),
                TypeDefKind::Flags(value)=>format!("{{ {} }}",value.flags.iter().map(|flag|format!("{}?: boolean",serde_json::to_string(&camel(&flag.name)).unwrap())).collect::<Vec<_>>().join("; ")),
                TypeDefKind::Variant(value)=>value.cases.iter().map(|case|Ok(format!("{{ tag: {}{} }}",serde_json::to_string(&case.name)?,case.ty.map(|value|ty(resolve,value,depth+1).map(|value|format!("; val: {value}"))).transpose()?.unwrap_or_default()))).collect::<Result<Vec<_>>>()?.join(" | "),
                TypeDefKind::Result(value)=>[Some(("ok",value.ok)),Some(("err",value.err))].into_iter().flatten().map(|(tag,value)|Ok(format!("{{ tag: {tag:?}{} }}",value.map(|value|ty(resolve,value,depth+1).map(|value|format!("; val: {value}"))).transpose()?.unwrap_or_default()))).collect::<Result<Vec<_>>>()?.join(" | "),
                _=>anyhow::bail!("This dependency requires native resource/async bindings; use the SDK's WIT bindings"),
            },
            _=>anyhow::bail!("Unsupported dependency WIT type"),
        })
    }
    let DecodedWasm::Component(resolve, world) = wit_component::decode(bytes)? else {
        anyhow::bail!("Expected a component");
    };
    let interfaces = resolve.worlds[world]
        .exports
        .values()
        .filter_map(|item| {
            if let WorldItem::Interface { id, .. } = item {
                Some(*id)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    let id = interfaces
        .iter()
        .copied()
        .find(|id| resolve.interfaces[*id].name.as_deref() == Some("api"))
        .or_else(|| {
            if interfaces.len() == 1 {
                interfaces.first().copied()
            } else {
                None
            }
        })
        .context("Ambiguous dependency interface")?;
    let mut output = format!(
        "declare module {} {{\n",
        serde_json::to_string(&format!("fluentci:dependency/{alias}"))?
    );
    for (index, function) in resolve.interfaces[id].functions.values().enumerate() {
        ensure!(
            matches!(function.kind, FunctionKind::Freestanding),
            "Resource methods require native WIT bindings"
        );
        let parameters = function
            .params
            .iter()
            .map(|param| {
                // Prefixing keeps WIT names such as `default` valid TS identifiers.
                Ok(format!(
                    "_{}: {}",
                    camel(&param.name),
                    ty(&resolve, param.ty, 0)?
                ))
            })
            .collect::<Result<Vec<_>>>()?
            .join(", ");
        let result = match function.result {
            Some(Type::Id(id)) if matches!(&resolve.types[id].kind, TypeDefKind::Result(_)) => {
                let TypeDefKind::Result(result) = &resolve.types[id].kind else {
                    unreachable!()
                };
                result
                    .ok
                    .map(|value| ty(&resolve, value, 0))
                    .transpose()?
                    .unwrap_or_else(|| "void".into())
            }
            Some(value) => ty(&resolve, value, 0)?,
            None => "void".into(),
        };
        if let Some(docs) = &function.docs.contents {
            output.push_str(&format!("/** {} */\n", docs.replace("*/", "* /")));
        }
        output.push_str(&format!("function _function{index}({parameters}): {result};\nexport {{ _function{index} as {} }};\n",camel(&function.name)));
    }
    output.push_str("}\n");
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn math() -> Result<Vec<u8>> {
        Ok(wat::parse_str(
            r#"(component
            (core module $m (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
            (core instance $i (instantiate $m))
            (func $add (param "left" u32) (param "right" u32) (result u32) (canon lift (core func $i "add")))
            (instance (export "api") (export "add" (func $add))))"#,
        )?)
    }

    #[test]
    fn typed_dependencies_compose_and_reject_incompatible_interfaces() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let dependency = directory.path().join("math.wasm");
        let bytes = math()?;
        std::fs::write(&dependency, &bytes)?;
        let descriptor = interface("math", &bytes)?;
        assert_eq!(descriptor.export, "api");
        assert!(descriptor.import.starts_with("fluentci:dependency-math/"));
        let mut resolve = wit_parser::Resolve::default();
        resolve.push_str("math.wit", &descriptor.wit)?;
        let root = directory.path().join("root.wasm");
        let consumer = r#"(component
            (import "math" (instance $math (export "add" (func (param "left" u32) (param "right" u32) (result u32)))))
            (alias export $math "add" (func $add))
            (export "sum" (func $add)))"#;
        std::fs::write(&root, wat::parse_str(consumer)?)?;
        let dependencies = BTreeMap::from([("math".into(), (dependency, descriptor))]);
        let composed = compose(&root, &dependencies)?;
        assert_eq!(
            crate::call(
                &composed,
                "sum",
                &["--left=20".into(), "--right=22".into()],
                Default::default()
            )?,
            "42"
        );
        std::fs::write(&root, wat::parse_str(consumer.replace("u32", "u64"))?)?;
        assert!(compose(&root, &dependencies).is_err());
        Ok(())
    }
    #[test]
    #[ignore = "requires a compiled SDK importer and dependency artifact"]
    fn compiled_sdk_imports_link_and_execute() -> Result<()> {
        let root = PathBuf::from(std::env::var("FLUENTCI_IMPORTER_COMPONENT")?);
        let dependency = PathBuf::from(std::env::var("FLUENTCI_DEPENDENCY_COMPONENT")?);
        let descriptor = interface("math", &std::fs::read(&dependency)?)?;
        let bytes = compose(
            &root,
            &BTreeMap::from([("math".into(), (dependency, descriptor))]),
        )?;
        let output = crate::call(&bytes, "sum", &[], Default::default())?;
        assert_eq!(output.parse::<f64>()?, 42.0);
        Ok(())
    }
}
