//! Native typed host linkage. Neither guest pointers nor Extism are involved.
use super::{values, Host};
use anyhow::{bail, ensure, Context, Result};
use serde_json::{json, Map, Value};
use std::sync::{Arc, OnceLock};
use wasmtime::component::{Linker, Val};
use wit_parser::{Resolve, Type, TypeDefKind};

fn schema() -> &'static Value {
    static MODEL: OnceLock<Value> = OnceLock::new();
    MODEL.get_or_init(|| {
        serde_json::from_str(include_str!("../model.json")).expect("generated host model")
    })
}

fn convert(ty: &Value, value: &Value, encode: bool) -> Result<Value> {
    let kind = ty["kind"].as_str().context("Missing wire kind")?;
    Ok(match kind {
        "scalar" => value.clone(),
        "json" => {
            if encode {
                Value::String(serde_json::to_string(value)?)
            } else {
                serde_json::from_str(value.as_str().context("Expected dynamic JSON text")?)?
            }
        }
        "option" => {
            if value.is_null() {
                Value::Null
            } else {
                convert(&ty["value"], value, encode)?
            }
        }
        "list" => Value::Array(
            value
                .as_array()
                .context("Expected list")?
                .iter()
                .map(|value| convert(&ty["value"], value, encode))
                .collect::<Result<_>>()?,
        ),
        "tuple" => Value::Array(
            ty["items"]
                .as_array()
                .context("Expected tuple model")?
                .iter()
                .zip(value.as_array().context("Expected tuple")?)
                .map(|(ty, value)| convert(ty, value, encode))
                .collect::<Result<_>>()?,
        ),
        "map" => {
            if encode {
                Value::Array(
                    value
                        .as_object()
                        .context("Expected map")?
                        .iter()
                        .map(|(key, value)| Ok(json!([key, convert(&ty["value"], value, encode)?])))
                        .collect::<Result<_>>()?,
                )
            } else {
                let mut result = Map::new();
                for entry in value.as_array().context("Expected map entries")? {
                    let key = entry[0].as_str().context("Map keys must be strings")?;
                    ensure!(!result.contains_key(key), "Duplicate map key");
                    result.insert(key.to_owned(), convert(&ty["value"], &entry[1], encode)?);
                }
                Value::Object(result)
            }
        }
        "ref" => {
            let model = &schema()["models"][ty["name"].as_str().context("Expected model name")?];
            if model["kind"] == "record" {
                let object = value.as_object().context("Expected record")?;
                let mut output = Map::new();
                for field in model["fields"].as_array().context("Missing fields")? {
                    let source = field[if encode { "name" } else { "wit" }].as_str().unwrap();
                    let target = field[if encode { "wit" } else { "name" }].as_str().unwrap();
                    let value = object.get(source).unwrap_or(&Value::Null);
                    if !encode && value.is_null() && field["omitNull"] == true {
                        continue;
                    }
                    output.insert(target.to_owned(), convert(&field["type"], value, encode)?);
                }
                Value::Object(output)
            } else {
                let tag = model["tag"].as_str();
                let content = model["content"].as_str();
                let cases = model["cases"].as_array().context("Missing variants")?;
                let all_unit = cases.iter().all(|case| case.get("type").is_none());
                let (case_name, payload) = if encode {
                    if let Some(tag) = tag {
                        (
                            value[tag].as_str().context("Missing variant tag")?,
                            if let Some(content) = content {
                                value[content].clone()
                            } else {
                                let mut object = value
                                    .as_object()
                                    .context("Expected tagged variant")?
                                    .clone();
                                object.remove(tag);
                                Value::Object(object)
                            },
                        )
                    } else if all_unit {
                        (value.as_str().context("Expected enum")?, Value::Null)
                    } else {
                        let object = value
                            .as_object()
                            .context("Expected externally tagged variant")?;
                        ensure!(object.len() == 1, "Expected one variant");
                        let (name, payload) = object.iter().next().unwrap();
                        (name.as_str(), payload.clone())
                    }
                } else if all_unit && tag.is_none() {
                    (value.as_str().context("Expected enum")?, Value::Null)
                } else {
                    let object = value.as_object().context("Expected variant")?;
                    ensure!(object.len() == 1, "Expected one variant");
                    let (name, payload) = object.iter().next().unwrap();
                    (name.as_str(), payload.clone())
                };
                let case = cases
                    .iter()
                    .find(|case| case[if encode { "name" } else { "wit" }] == case_name)
                    .context("Unknown variant case")?;
                let payload = case
                    .get("type")
                    .map(|ty| convert(ty, &payload, encode))
                    .transpose()?
                    .unwrap_or(Value::Null);
                let target = case[if encode { "wit" } else { "name" }].as_str().unwrap();
                if encode {
                    if all_unit && tag.is_none() {
                        Value::String(target.into())
                    } else {
                        json!({target:payload})
                    }
                } else if let Some(tag) = tag {
                    let mut object = if case.get("type").is_none() || content.is_some() {
                        Map::new()
                    } else {
                        payload
                            .as_object()
                            .context("Expected record variant payload")?
                            .clone()
                    };
                    object.insert(tag.into(), Value::String(target.into()));
                    if let Some(content) = content {
                        object.insert(content.into(), payload);
                    }
                    Value::Object(object)
                } else if all_unit {
                    Value::String(target.into())
                } else {
                    json!({target:payload})
                }
            }
        }
        _ => bail!("Unsupported generated wire kind {kind}"),
    })
}

pub fn register(linker: &mut Linker<Host>, resolve: &Resolve) -> Result<()> {
    let Some((_, interface)) = resolve.interfaces.iter().find(|(_, interface)| {
        interface.name.as_deref() == Some("api")
            && interface
                .package
                .is_some_and(|id| resolve.packages[id].name.to_string() == "fluentci:runtime@0.1.0")
    }) else {
        return Ok(());
    };
    let resolve = Arc::new(resolve.clone());
    let mut api = linker.instance("fluentci:runtime/api@0.1.0")?;
    for (name, function) in &interface.functions {
        let operation = name.replace('-', "_");
        let descriptor = schema()["operations"]
            .get(&operation)
            .context("Unknown host operation in component")?
            .clone();
        let parameters = function
            .params
            .iter()
            .map(|parameter| parameter.ty)
            .collect::<Vec<_>>();
        let Type::Id(result_id) = function.result.context("Missing host result")? else {
            bail!("Host operation must return a result");
        };
        let TypeDefKind::Result(result) = &resolve.types[result_id].kind else {
            bail!("Host operation must return a result");
        };
        let ok = result.ok;
        let resolve = resolve.clone();
        api.func_new(name, move |store, _, arguments, results| {
            let context = store.data().context.clone();
            let result = (|| -> Result<Option<Box<Val>>> {
                let input = if !parameters.is_empty() {
                    convert(
                        &descriptor["input"],
                        &values::json_value(arguments.first().context("Missing host argument")?)?,
                        false,
                    )
                    .context("Decoding native host input")?
                } else {
                    Value::Null
                };
                let output = if operation == "execute_plan" {
                    let directory =
                        values::json_value(arguments.get(1).context("Missing run directory")?)?
                            .as_str()
                            .context("Expected run directory")?
                            .to_owned();
                    serde_json::to_value(fluentci_common::host::execute_typed(
                        &context,
                        serde_json::from_value(input)?,
                        directory.into(),
                    )?)?
                } else {
                    fluentci_common::host::invoke_value(&context, &operation, input)?
                };
                ok.map(|ty| {
                    Ok(Box::new(values::value_for(
                        &resolve,
                        ty,
                        &convert(&descriptor["output"], &output, true)?,
                    )?))
                })
                .transpose()
            })();
            results[0] = Val::Result(
                result.map_err(|error| Some(Box::new(Val::String(format!("{error:#}"))))),
            );
            Ok(())
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_contract_stays_at_version_0_1_with_both_interfaces() -> Result<()> {
        let mut resolve = Resolve::default();
        let package = resolve.push_str("runtime.wit", include_str!("../wit/runtime.wit"))?;
        assert_eq!(
            resolve.packages[package].name.to_string(),
            "fluentci:runtime@0.1.0"
        );
        let interfaces = &resolve.packages[package].interfaces;
        let host = &resolve.interfaces[interfaces["host"]];
        assert_eq!(host.functions.len(), 3);
        let api = &resolve.interfaces[interfaces["api"]];
        let operations = schema()["operations"].as_object().unwrap();
        assert_eq!(api.functions.len(), operations.len());
        for operation in operations.values() {
            assert!(api
                .functions
                .contains_key(operation["wit"].as_str().unwrap()));
        }
        Ok(())
    }

    #[test]
    fn typed_plan_roundtrips_maps_defaults_and_tagged_primitives() -> Result<()> {
        let native = json!({"version":1,"tasks":[
            {"id":"digest","cwd":".","program":"","primitive":{"kind":"digest","algorithm":"sha256","input":{"source":"text","value":"abc"}},"env":{"LITERAL":"spaces and quotes '"}},
            {"id":"os","cwd":".","program":"","primitive":{"kind":"os"},"needs":["digest"]}
        ]});
        let plan: fluentci_executor::Plan = serde_json::from_value(native)?;
        let native = serde_json::to_value(&plan)?;
        let descriptor = &schema()["operations"]["execute_plan"]["input"];
        let wire = convert(descriptor, &native, true)?;
        let mut resolve = Resolve::default();
        let package = resolve.push_str("runtime.wit", include_str!("../wit/runtime.wit"))?;
        let api = &resolve.interfaces[resolve.packages[package].interfaces["api"]];
        let ty = api.functions["execute-plan"].params[0].ty;
        let lifted = values::value_for(&resolve, ty, &wire)?;
        let decoded = convert(descriptor, &values::json_value(&lifted)?, false)?;
        let restored: fluentci_executor::Plan = serde_json::from_value(decoded)?;
        assert_eq!(serde_json::to_value(restored)?, native);
        Ok(())
    }
}
