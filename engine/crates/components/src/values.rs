use crate::interface::{fields, optional, unalias, Function};
use anyhow::{bail, ensure, Context, Result};
use serde_json::{json, Map, Value};
use wasmtime::component::Val;
use wit_parser::{Resolve, Type, TypeDefKind};

fn parse(resolve: &Resolve, ty: Type, text: &str) -> Result<Value> {
    let ty = unalias(resolve, ty);
    if let Type::Id(id) = ty {
        if let TypeDefKind::Option(inner) = resolve.types[id].kind {
            return parse(resolve, inner, text);
        }
        if matches!(resolve.types[id].kind, TypeDefKind::Enum(_)) {
            return Ok(Value::String(text.into()));
        }
    }
    if matches!(ty, Type::String | Type::Char) {
        Ok(Value::String(text.into()))
    } else {
        serde_json::from_str(text).context("Expected a typed JSON value")
    }
}

pub(crate) fn bind(resolve: &Resolve, function: &Function, words: &[String]) -> Result<Vec<Val>> {
    let fields = fields(resolve, function);
    let mut values = Map::new();
    let mut index = 0;
    let mut positional = false;
    while let Some(word) = words.get(index) {
        index += 1;
        if !positional && word == "--" {
            positional = true;
            continue;
        }
        let ((name, ty, _), value) = if !positional && word.starts_with("--") {
            let (flag, inline) = word[2..]
                .split_once('=')
                .map_or((&word[2..], None), |(name, value)| (name, Some(value)));
            let field = fields
                .iter()
                .find(|field| field.0 == flag)
                .with_context(|| format!("Unknown argument --{flag}"))?;
            let mut ty = unalias(resolve, field.1);
            if let Type::Id(id) = ty {
                if let TypeDefKind::Option(inner) = resolve.types[id].kind {
                    ty = unalias(resolve, inner);
                }
            }
            let raw = if let Some(raw) = inline {
                raw
            } else if ty == Type::Bool
                && !words
                    .get(index)
                    .is_some_and(|word| matches!(word.as_str(), "true" | "false"))
            {
                "true"
            } else {
                let raw = words
                    .get(index)
                    .filter(|word| !word.starts_with("--"))
                    .with_context(|| format!("Missing value for --{flag}"))?;
                index += 1;
                raw
            };
            (field, parse(resolve, field.1, raw)?)
        } else {
            let field = fields
                .iter()
                .find(|field| !values.contains_key(&field.0))
                .context("Too many positional arguments")?;
            (field, parse(resolve, field.1, word)?)
        };
        ensure!(!values.contains_key(name), "Duplicate argument --{name}");
        value_for(resolve, *ty, &value).with_context(|| format!("--{name}"))?;
        values.insert(name.clone(), value);
    }
    for (name, ty, _) in &fields {
        ensure!(
            values.contains_key(name) || optional(resolve, *ty),
            "Missing required argument --{name}"
        );
    }
    if let [parameter] = function.signature.params.as_slice() {
        if let Type::Id(id) = unalias(resolve, parameter.ty) {
            if matches!(resolve.types[id].kind, TypeDefKind::Record(_)) {
                return Ok(vec![value_for(
                    resolve,
                    parameter.ty,
                    &Value::Object(values),
                )?]);
            }
        }
    }
    function
        .signature
        .params
        .iter()
        .map(|parameter| {
            value_for(
                resolve,
                parameter.ty,
                values.get(&parameter.name).unwrap_or(&Value::Null),
            )
        })
        .collect()
}

fn payload(resolve: &Resolve, ty: Option<Type>, value: &Value) -> Result<Option<Box<Val>>> {
    match ty {
        Some(ty) => Ok(Some(Box::new(value_for(resolve, ty, value)?))),
        None => {
            ensure!(value.is_null(), "This case has no payload");
            Ok(None)
        }
    }
}

fn value_for(resolve: &Resolve, ty: Type, value: &Value) -> Result<Val> {
    macro_rules! signed {
        ($kind:ident,$ty:ty) => {
            Val::$kind(
                <$ty>::try_from(value.as_i64().context("Expected an integer")?)
                    .context("Integer is out of range")?,
            )
        };
    }
    macro_rules! unsigned {
        ($kind:ident,$ty:ty) => {
            Val::$kind(
                <$ty>::try_from(value.as_u64().context("Expected an unsigned integer")?)
                    .context("Integer is out of range")?,
            )
        };
    }
    Ok(match ty {
        Type::Bool => Val::Bool(value.as_bool().context("Expected a boolean")?),
        Type::S8 => signed!(S8, i8),
        Type::S16 => signed!(S16, i16),
        Type::S32 => signed!(S32, i32),
        Type::S64 => Val::S64(value.as_i64().context("Expected a signed 64-bit integer")?),
        Type::U8 => unsigned!(U8, u8),
        Type::U16 => unsigned!(U16, u16),
        Type::U32 => unsigned!(U32, u32),
        Type::U64 => Val::U64(
            value
                .as_u64()
                .context("Expected an unsigned 64-bit integer")?,
        ),
        Type::F32 => {
            let value = value.as_f64().context("Expected a number")? as f32;
            ensure!(value.is_finite(), "Expected a finite f32");
            Val::Float32(value)
        }
        Type::F64 => {
            let value = value.as_f64().context("Expected a number")?;
            ensure!(value.is_finite(), "Expected a finite f64");
            Val::Float64(value)
        }
        Type::String => Val::String(value.as_str().context("Expected a string")?.into()),
        Type::Char => {
            let text = value.as_str().context("Expected a character")?;
            let mut chars = text.chars();
            let ch = chars.next().context("Expected one character")?;
            ensure!(chars.next().is_none(), "Expected one character");
            Val::Char(ch)
        }
        Type::Id(id) => match &resolve.types[id].kind {
            TypeDefKind::Type(ty) => return value_for(resolve, *ty, value),
            TypeDefKind::Option(ty) => Val::Option(if value.is_null() {
                None
            } else {
                Some(Box::new(value_for(resolve, *ty, value)?))
            }),
            TypeDefKind::List(ty) => Val::List(
                value
                    .as_array()
                    .context("Expected a JSON array")?
                    .iter()
                    .map(|value| value_for(resolve, *ty, value))
                    .collect::<Result<_>>()?,
            ),
            TypeDefKind::Record(record) => {
                let object = value.as_object().context("Expected a JSON record")?;
                ensure!(
                    object
                        .keys()
                        .all(|name| record.fields.iter().any(|field| &field.name == name)),
                    "Unknown record field"
                );
                Val::Record(
                    record
                        .fields
                        .iter()
                        .map(|field| {
                            Ok((
                                field.name.clone(),
                                value_for(
                                    resolve,
                                    field.ty,
                                    object.get(&field.name).unwrap_or(&Value::Null),
                                )
                                .with_context(|| field.name.clone())?,
                            ))
                        })
                        .collect::<Result<_>>()?,
                )
            }
            TypeDefKind::Tuple(tuple) => {
                let array = value.as_array().context("Expected a JSON tuple array")?;
                ensure!(array.len() == tuple.types.len(), "Wrong tuple length");
                Val::Tuple(
                    tuple
                        .types
                        .iter()
                        .zip(array)
                        .map(|(ty, value)| value_for(resolve, *ty, value))
                        .collect::<Result<_>>()?,
                )
            }
            TypeDefKind::Enum(enumeration) => {
                let name = value.as_str().context("Expected an enum case")?;
                ensure!(
                    enumeration.cases.iter().any(|case| case.name == name),
                    "Unknown enum case {name}"
                );
                Val::Enum(name.into())
            }
            TypeDefKind::Flags(flags) => {
                let names = value
                    .as_array()
                    .context("Expected a JSON flags array")?
                    .iter()
                    .map(|value| {
                        value
                            .as_str()
                            .map(str::to_owned)
                            .context("Flag names must be strings")
                    })
                    .collect::<Result<Vec<_>>>()?;
                let mut seen = std::collections::HashSet::new();
                ensure!(
                    names.iter().all(|name| seen.insert(name)
                        && flags.flags.iter().any(|flag| &flag.name == name)),
                    "Unknown or duplicate flag"
                );
                Val::Flags(names)
            }
            TypeDefKind::Variant(variant) => {
                let object = value
                    .as_object()
                    .context("Expected a single-key variant object")?;
                ensure!(object.len() == 1, "Expected one variant case");
                let (name, value) = object.iter().next().unwrap();
                let case = variant
                    .cases
                    .iter()
                    .find(|case| &case.name == name)
                    .context("Unknown variant case")?;
                Val::Variant(name.clone(), payload(resolve, case.ty, value)?)
            }
            TypeDefKind::Result(result) => {
                let object = value
                    .as_object()
                    .context("Expected an ok/err result object")?;
                ensure!(object.len() == 1, "Expected exactly one result case");
                if let Some(value) = object.get("ok") {
                    Val::Result(Ok(payload(resolve, result.ok, value)?))
                } else if let Some(value) = object.get("err") {
                    Val::Result(Err(payload(resolve, result.err, value)?))
                } else {
                    bail!("Expected ok or err result case")
                }
            }
            _ => bail!(
                "WIT {} values cannot be constructed from CLI arguments",
                resolve.types[id].kind.as_str()
            ),
        },
        _ => bail!("Unsupported WIT argument type"),
    })
}

fn json_value(value: &Val) -> Result<Value> {
    Ok(match value {
        Val::Bool(value) => json!(value),
        Val::S8(value) => json!(value),
        Val::S16(value) => json!(value),
        Val::S32(value) => json!(value),
        Val::S64(value) => json!(value),
        Val::U8(value) => json!(value),
        Val::U16(value) => json!(value),
        Val::U32(value) => json!(value),
        Val::U64(value) => json!(value),
        Val::Float32(value) => {
            ensure!(value.is_finite(), "Non-finite result");
            json!(value)
        }
        Val::Float64(value) => {
            ensure!(value.is_finite(), "Non-finite result");
            json!(value)
        }
        Val::Char(value) => json!(value.to_string()),
        Val::String(value) => json!(value),
        Val::Option(value) => value
            .as_deref()
            .map(json_value)
            .transpose()?
            .unwrap_or(Value::Null),
        Val::List(values) | Val::Tuple(values) => {
            Value::Array(values.iter().map(json_value).collect::<Result<_>>()?)
        }
        Val::Record(fields) => Value::Object(
            fields
                .iter()
                .map(|(name, value)| Ok((name.clone(), json_value(value)?)))
                .collect::<Result<_>>()?,
        ),
        Val::Enum(name) => json!(name),
        Val::Flags(names) => json!(names),
        Val::Variant(name, value) => {
            let mut object = Map::new();
            object.insert(
                name.clone(),
                value
                    .as_deref()
                    .map(json_value)
                    .transpose()?
                    .unwrap_or(Value::Null),
            );
            Value::Object(object)
        }
        Val::Result(value) => {
            let (key, value) = match value {
                Ok(value) => ("ok", value),
                Err(value) => ("err", value),
            };
            json!({key:value.as_deref().map(json_value).transpose()?.unwrap_or(Value::Null)})
        }
        _ => bail!("Resource, future, and stream results cannot be printed as CLI values"),
    })
}

pub(crate) fn output(results: &[Val]) -> Result<String> {
    let value = match results {
        [] => return Ok(String::new()),
        [Val::Result(Err(value))] => bail!(
            "{}",
            value
                .as_deref()
                .map(json_value)
                .transpose()?
                .unwrap_or(Value::Null)
        ),
        [Val::Result(Ok(value))] => value
            .as_deref()
            .map(json_value)
            .transpose()?
            .unwrap_or(Value::Null),
        [value] => json_value(value)?,
        values => Value::Array(values.iter().map(json_value).collect::<Result<_>>()?),
    };
    Ok(match value {
        Value::String(value) => value,
        Value::Null => String::new(),
        other => serde_json::to_string(&other)?,
    })
}
