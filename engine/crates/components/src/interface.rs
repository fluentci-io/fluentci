//! Read signatures from the component's actual WIT type surface without running it.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wit_parser::{Function as WitFunction, Resolve, Type, TypeDefKind, WorldItem};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Argument {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Function {
    pub name: String,
    pub path: Vec<String>,
    pub signature: WitFunction,
}

pub struct Surface {
    pub resolve: Resolve,
    pub functions: Vec<Function>,
}

impl Surface {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let wit_component::DecodedWasm::Component(resolve, world) =
            wit_component::decode(bytes).context("Reading component WIT")?
        else {
            bail!("Expected a Wasm component");
        };
        let mut functions = vec![];
        for (key, item) in &resolve.worlds[world].exports {
            let export = resolve.name_world_key(key);
            if export.starts_with("wasi:") {
                continue;
            }
            match item {
                WorldItem::Function(signature) => functions.push(Function {
                    name: signature.name.clone(),
                    path: vec![export],
                    signature: signature.clone(),
                }),
                WorldItem::Interface { id, .. } => {
                    for (name, signature) in &resolve.interfaces[*id].functions {
                        if !matches!(signature.kind, wit_parser::FunctionKind::Freestanding) {
                            continue;
                        }
                        functions.push(Function {
                            name: name.clone(),
                            path: vec![export.clone(), name.clone()],
                            signature: signature.clone(),
                        });
                    }
                }
                _ => {}
            }
        }
        let mut counts = HashMap::new();
        for function in &functions {
            *counts.entry(function.name.clone()).or_insert(0) += 1;
        }
        for function in &mut functions {
            if counts[&function.name] > 1 {
                function.name = function.path.join("#");
            }
        }
        functions.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(Self { resolve, functions })
    }

    pub fn find(&self, name: &str) -> Result<&Function> {
        self.functions
            .iter()
            .find(|function| function.name == name || function.path.join("#") == name)
            .with_context(|| format!("WIT function {name:?} not found"))
    }
}

pub(crate) fn unalias(resolve: &Resolve, mut ty: Type) -> Type {
    while let Type::Id(id) = ty {
        if let TypeDefKind::Type(next) = resolve.types[id].kind {
            ty = next;
        } else {
            break;
        }
    }
    ty
}

pub fn optional(resolve: &Resolve, ty: Type) -> bool {
    matches!(unalias(resolve, ty), Type::Id(id) if matches!(resolve.types[id].kind, TypeDefKind::Option(_)))
}

pub fn fields(resolve: &Resolve, function: &Function) -> Vec<(String, Type, Option<String>)> {
    if let [parameter] = function.signature.params.as_slice() {
        if let Type::Id(id) = unalias(resolve, parameter.ty) {
            if let TypeDefKind::Record(record) = &resolve.types[id].kind {
                return record
                    .fields
                    .iter()
                    .map(|field| (field.name.clone(), field.ty, field.docs.contents.clone()))
                    .collect();
            }
        }
    }
    function
        .signature
        .params
        .iter()
        .map(|parameter| (parameter.name.clone(), parameter.ty, None))
        .collect()
}

pub fn type_name(resolve: &Resolve, ty: Type) -> String {
    match ty {
        Type::Id(id) => {
            let definition = &resolve.types[id];
            match &definition.kind {
                TypeDefKind::Type(ty) => type_name(resolve, *ty),
                TypeDefKind::Option(ty) => format!("option<{}>", type_name(resolve, *ty)),
                TypeDefKind::List(ty) => format!("list<{}>", type_name(resolve, *ty)),
                TypeDefKind::Result(result) => format!(
                    "result<{}, {}>",
                    result
                        .ok
                        .map(|ty| type_name(resolve, ty))
                        .unwrap_or("_".into()),
                    result
                        .err
                        .map(|ty| type_name(resolve, ty))
                        .unwrap_or("_".into())
                ),
                TypeDefKind::Tuple(tuple) => format!(
                    "tuple<{}>",
                    tuple
                        .types
                        .iter()
                        .map(|ty| type_name(resolve, *ty))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                _ => definition
                    .name
                    .clone()
                    .unwrap_or_else(|| definition.kind.as_str().into()),
            }
        }
        _ => format!("{ty:?}").to_lowercase(),
    }
}

impl Function {
    pub fn arguments(&self, resolve: &Resolve) -> Vec<Argument> {
        fields(resolve, self)
            .into_iter()
            .map(|(name, ty, description)| Argument {
                name,
                type_name: type_name(resolve, ty),
                required: !optional(resolve, ty),
                description,
            })
            .collect()
    }

    pub fn returns(&self, resolve: &Resolve) -> String {
        self.signature
            .result
            .map(|ty| type_name(resolve, ty))
            .unwrap_or_else(|| "unit".into())
    }
}
