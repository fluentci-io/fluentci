//! Native WIT adapters for the existing fluentci-pdk API. No Extism dependency.
pub use anyhow::Error;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

pub mod bindings {
    wit_bindgen::generate!({path:"wit",world:"sdk",generate_all,additional_derives:[serde::Serialize,serde::Deserialize]});
}

#[derive(Serialize, Deserialize)]
#[serde(transparent)]
pub struct Json<T>(pub T);

impl<T> Json<T> {
    pub fn into_inner(self) -> T {
        self.0
    }
}
impl<T> From<T> for Json<T> {
    fn from(value: T) -> Self {
        Self(value)
    }
}

fn schema() -> &'static Value {
    static MODEL: OnceLock<Value> = OnceLock::new();
    MODEL.get_or_init(|| {
        serde_json::from_str(include_str!("../model.json")).expect("generated SDK schema")
    })
}
fn pascal(value: &str) -> String {
    value
        .split('-')
        .map(|part| {
            let mut chars = part.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect()
}

fn convert(ty: &Value, value: &Value, encode: bool) -> Result<Value, Error> {
    use anyhow::{bail, Context};
    Ok(match ty["kind"].as_str().context("Missing wire kind")? {
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
                .collect::<Result<_, _>>()?,
        ),
        "tuple" => Value::Array(
            ty["items"]
                .as_array()
                .context("Missing tuple model")?
                .iter()
                .zip(value.as_array().context("Expected tuple")?)
                .map(|(ty, value)| convert(ty, value, encode))
                .collect::<Result<_, _>>()?,
        ),
        "map" => {
            if encode {
                Value::Array(
                    value
                        .as_object()
                        .context("Expected map")?
                        .iter()
                        .map(|(key, value)| Ok(json!([key, convert(&ty["value"], value, true)?])))
                        .collect::<Result<_, Error>>()?,
                )
            } else {
                Value::Object(
                    value
                        .as_array()
                        .context("Expected map entries")?
                        .iter()
                        .map(|entry| {
                            Ok((
                                entry[0].as_str().context("Expected string key")?.to_owned(),
                                convert(&ty["value"], &entry[1], false)?,
                            ))
                        })
                        .collect::<Result<_, Error>>()?,
                )
            }
        }
        "ref" => {
            let model = &schema()["models"][ty["name"].as_str().context("Missing type name")?];
            if model["kind"] == "record" {
                let object = value.as_object().context("Expected record")?;
                let mut result = Map::new();
                for field in model["fields"]
                    .as_array()
                    .context("Missing record fields")?
                {
                    let native = field["name"].as_str().unwrap();
                    let wire = field["wit"].as_str().unwrap().replace('-', "_");
                    let item = object
                        .get(if encode { native } else { &wire })
                        .unwrap_or(&Value::Null);
                    if !encode && item.is_null() && field["omitNull"] == true {
                        continue;
                    }
                    result.insert(
                        if encode { wire } else { native.into() },
                        convert(&field["type"], item, encode)?,
                    );
                }
                Value::Object(result)
            } else {
                let tag = model["tag"].as_str();
                let content = model["content"].as_str();
                let cases = model["cases"].as_array().context("Missing variants")?;
                let unit = cases.iter().all(|case| case.get("type").is_none());
                let (name, payload) = if encode {
                    if let Some(tag) = tag {
                        (
                            value[tag]
                                .as_str()
                                .context("Missing variant tag")?
                                .to_owned(),
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
                    } else if unit {
                        (
                            value.as_str().context("Expected enum")?.to_owned(),
                            Value::Null,
                        )
                    } else {
                        let object = value.as_object().context("Expected variant")?;
                        anyhow::ensure!(object.len() == 1, "Expected one variant");
                        let (name, payload) = object.iter().next().unwrap();
                        (name.clone(), payload.clone())
                    }
                } else if let Some(name) = value.as_str() {
                    (name.to_owned(), Value::Null)
                } else {
                    let object = value.as_object().context("Expected variant")?;
                    anyhow::ensure!(object.len() == 1, "Expected one variant");
                    let (name, payload) = object.iter().next().unwrap();
                    (name.clone(), payload.clone())
                };
                let case = cases
                    .iter()
                    .find(|case| {
                        if encode {
                            case["name"] == name
                        } else {
                            pascal(case["wit"].as_str().unwrap()) == name
                        }
                    })
                    .context("Unknown variant")?;
                let payload = case
                    .get("type")
                    .map(|ty| convert(ty, &payload, encode))
                    .transpose()?
                    .unwrap_or(Value::Null);
                let name = if encode {
                    pascal(case["wit"].as_str().unwrap())
                } else {
                    case["name"].as_str().unwrap().to_owned()
                };
                if encode {
                    if case.get("type").is_none() {
                        Value::String(name)
                    } else {
                        json!({name:payload})
                    }
                } else if let Some(tag) = tag {
                    let mut object = if case.get("type").is_none() || content.is_some() {
                        Map::new()
                    } else {
                        payload
                            .as_object()
                            .context("Expected variant fields")?
                            .clone()
                    };
                    object.insert(tag.into(), Value::String(name));
                    if let Some(content) = content {
                        object.insert(content.into(), payload);
                    }
                    Value::Object(object)
                } else if unit {
                    Value::String(name)
                } else {
                    json!({name:payload})
                }
            }
        }
        kind => bail!("Unsupported wire kind {kind}"),
    })
}

pub fn invoke(name: &str, input: Value) -> Result<Value, Error> {
    let operation = &schema()["operations"][name];
    let input = if name == "execute_plan" {
        let request: Value = serde_json::from_str(
            input
                .as_str()
                .ok_or_else(|| Error::msg("Expected encoded plan request"))?,
        )?;
        return Ok(Value::String(serde_json::to_string(&execute_plan_value(
            &request["plan"],
            request["run_dir"]
                .as_str()
                .ok_or_else(|| Error::msg("Missing run directory"))?,
        )?)?));
    } else if operation["input"].is_null() {
        Value::Null
    } else {
        convert(&operation["input"], &input, true)?
    };
    let output = dispatch(name, input)?;
    if operation["output"].is_null() {
        Ok(Value::Null)
    } else {
        convert(&operation["output"], &output, false)
    }
}

pub fn execute_plan_value(plan: &Value, directory: &str) -> Result<Value, Error> {
    let operation = &schema()["operations"]["execute_plan"];
    let plan = serde_json::from_value(convert(&operation["input"], plan, true)?)?;
    let result =
        bindings::fluentci::runtime::api::execute_plan(&plan, directory).map_err(Error::msg)?;
    convert(&operation["output"], &serde_json::to_value(result)?, false)
}

include!("component_dispatch.rs");
