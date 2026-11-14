//! Language-neutral contracts for generated pipeline bindings. Never infer types
//! from a README or registry description: the installed component is authoritative.
use anyhow::{ensure, Context, Result};
use serde_json::{json, Value};
use wit_component::DecodedWasm;
use wit_parser::{FunctionKind, Resolve, Type, TypeDefKind, WorldItem};

fn shape(resolve: &Resolve, ty: Type, depth: usize) -> Result<Value> {
    ensure!(depth < 64, "Pipeline binding type nesting exceeds 64");
    Ok(match ty {
        Type::Bool => json!({"kind":"bool"}),
        Type::String | Type::Char => json!({"kind":"string"}),
        Type::U8 | Type::U16 | Type::U32 | Type::S8 | Type::S16 | Type::S32 => {
            json!({"kind":"int","wire":format!("{ty:?}").to_lowercase()})
        }
        Type::U64 | Type::S64 => json!({"kind":"bigint","wire":format!("{ty:?}").to_lowercase()}),
        Type::F32 | Type::F64 => json!({"kind":"float","wire":format!("{ty:?}").to_lowercase()}),
        Type::Id(id) => {
            let definition = &resolve.types[id];
            let mut value = match &definition.kind {
                TypeDefKind::Type(ty) => shape(resolve, *ty, depth + 1)?,
                TypeDefKind::Option(ty) => json!({"kind":"option","item":shape(resolve,*ty,depth+1)?}),
                TypeDefKind::List(ty) => json!({"kind":"list","item":shape(resolve,*ty,depth+1)?}),
                TypeDefKind::Record(record) => json!({"kind":"record","fields":record.fields.iter().map(|field|Ok(json!({"name":field.name,"description":field.docs.contents,"type":shape(resolve,field.ty,depth+1)?}))).collect::<Result<Vec<_>>>()?}),
                TypeDefKind::Enum(value) => json!({"kind":"enum","cases":value.cases.iter().map(|case|case.name.clone()).collect::<Vec<_>>()}),
                TypeDefKind::Result(value) => json!({"kind":"result","ok":value.ok.map(|ty|shape(resolve,ty,depth+1)).transpose()?,"err":value.err.map(|ty|shape(resolve,ty,depth+1)).transpose()?}),
                TypeDefKind::Tuple(value) => json!({"kind":"tuple","items":value.types.iter().map(|ty|shape(resolve,*ty,depth+1)).collect::<Result<Vec<_>>>()?}),
                _ => anyhow::bail!("Pipeline bindings for resources, variants and flags require explicit SDK support"),
            };
            if let Some(name) = &definition.name {
                value["name"] = json!(name);
            }
            value
        }
        _ => anyhow::bail!("Unsupported pipeline binding type"),
    })
}

pub fn contract(alias: &str, bytes: &[u8]) -> Result<Value> {
    let DecodedWasm::Component(resolve, world) = wit_component::decode(bytes)? else {
        anyhow::bail!("Expected a component dependency");
    };
    let interfaces = resolve.worlds[world]
        .exports
        .values()
        .filter_map(|item| match item {
            WorldItem::Interface { id, .. } => Some(*id),
            _ => None,
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
    let functions = resolve.interfaces[id].functions.values().map(|function| {
        ensure!(matches!(function.kind,FunctionKind::Freestanding),"Resource methods require native WIT bindings");
        let params = function.params.iter().map(|param|Ok(json!({"name":param.name,"type":shape(&resolve,param.ty,0)?}))).collect::<Result<Vec<_>>>()?;
        let output = function.result.map(|ty|shape(&resolve,ty,0)).transpose()?.unwrap_or(json!({"kind":"unit"}));
        Ok(json!({"name":function.name,"description":function.docs.contents,"params":params,"output":output}))
    }).collect::<Result<Vec<_>>>()?;
    Ok(json!({"alias":alias,"functions":functions}))
}

fn pascal(value: &str) -> String {
    value
        .split(['-', '_'])
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect()
}
fn camel(value: &str) -> String {
    let value = pascal(value);
    let mut chars = value.chars();
    chars
        .next()
        .map(|first| first.to_lowercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}
fn snake(value: &str) -> String {
    let mut output = String::new();
    for ch in value.chars() {
        if ch == '-' {
            output.push('_');
        } else if ch.is_ascii_uppercase() {
            if !output.is_empty() {
                output.push('_');
            }
            output.push(ch.to_ascii_lowercase());
        } else {
            output.push(ch);
        }
    }
    output
}

fn output(function: &Value) -> Value {
    let value = &function["output"];
    if value["kind"] == "result" {
        value
            .get("ok")
            .filter(|v| !v.is_null())
            .cloned()
            .unwrap_or(json!({"kind":"unit"}))
    } else {
        value.clone()
    }
}
fn field_type(value: &Value, sdk: &str) -> String {
    let item = || field_type(&value["item"], sdk);
    match (value["kind"].as_str().unwrap_or("unit"), sdk) {
        ("string" | "enum", "purescript" | "gleam") => "String".into(),
        ("string" | "enum", "python") => "str".into(),
        ("string" | "enum", _) => "string".into(),
        ("bool", "purescript") => "Boolean".into(),
        ("bool", "gleam") => "Bool".into(),
        ("bool", "typescript") => "boolean".into(),
        ("bool", _) => "bool".into(),
        ("int", "purescript" | "gleam") => "Int".into(),
        ("int", "typescript") => "number".into(),
        ("int", _) => "int".into(),
        ("float", "purescript") => "Number".into(),
        ("float", "gleam") => "Float".into(),
        ("float", "typescript") => "number".into(),
        ("float", _) => "float".into(),
        ("bigint", "typescript" | "rescript") => "bigint".into(),
        ("bigint", "purescript" | "gleam") => "String".into(),
        ("bigint", "python") => "int".into(),
        ("option", "purescript") => format!("Maybe ({})", item()),
        ("option", "gleam") => format!("Option({})", item()),
        ("option", "typescript") => format!("({} | undefined)", item()),
        ("option", "python") => format!("{} | None", item()),
        ("option", _) => format!("option<{}>", item()),
        ("list", "purescript") => format!("Array ({})", item()),
        ("list", "gleam") => format!("List({})", item()),
        ("list", "python") => format!("list[{}]", item()),
        ("list", "typescript") => format!("Array<{}>", item()),
        ("list", _) => format!("array<{}>", item()),
        ("record", "purescript" | "typescript" | "rescript") => {
            let separator = if sdk == "purescript" { " :: " } else { ": " };
            let fields = value["fields"]
                .as_array()
                .map(|fields| {
                    fields
                        .iter()
                        .map(|field| {
                            let name = camel(field["name"].as_str().unwrap_or("field"));
                            let optional =
                                if sdk == "typescript" && field["type"]["kind"] == "option" {
                                    "?"
                                } else {
                                    ""
                                };
                            format!(
                                "{}{}{}{}",
                                serde_json::to_string(&name).unwrap_or_default(),
                                optional,
                                separator,
                                field_type(&field["type"], sdk)
                            )
                        })
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            format!("{{ {fields} }}")
        }
        ("record", _) => pascal(value["name"].as_str().unwrap_or("Record")),
        (_, "purescript") => "Unit".into(),
        (_, "gleam") => "Nil".into(),
        (_, "python") => "None".into(),
        (_, "typescript") => "void".into(),
        _ => "unit".into(),
    }
}

fn gleam_records(value: &Value, records: &mut std::collections::BTreeMap<String, Value>) {
    if value["kind"] == "record" {
        if let Some(name) = value["name"].as_str() {
            records.insert(pascal(name), value.clone());
        }
        if let Some(fields) = value["fields"].as_array() {
            for field in fields {
                gleam_records(&field["type"], records);
            }
        }
    }
    if let Some(item) = value.get("item") {
        gleam_records(item, records);
    }
}
fn defaults(name: &str, title: &str, input: &Value, sdk: &str) -> String {
    let fields = input["fields"].as_array().cloned().unwrap_or_default();
    let required = fields
        .iter()
        .filter(|f| f["type"]["kind"] != "option")
        .collect::<Vec<_>>();
    let join = |parts: Vec<String>| parts.join(", ");
    match sdk {
        "purescript" => {
            let body = join(
                fields
                    .iter()
                    .map(|f| {
                        let label = camel(f["name"].as_str().unwrap_or("field"));
                        format!(
                            "{label:?}: {}",
                            if f["type"]["kind"] == "option" {
                                "Nothing".into()
                            } else {
                                format!("required.{label}")
                            }
                        )
                    })
                    .collect(),
            );
            if required.is_empty() {
                format!("{name}Args :: {title}Args\n{name}Args = {{ {body} }}\n")
            } else {
                let signature = join(
                    required
                        .iter()
                        .map(|f| {
                            format!(
                                "{:?} :: {}",
                                camel(f["name"].as_str().unwrap_or("field")),
                                field_type(&f["type"], sdk)
                            )
                        })
                        .collect(),
                );
                format!("{name}Args :: {{ {signature} }} -> {title}Args\n{name}Args required = {{ {body} }}\n")
            }
        }
        "gleam" => {
            let parameters = join(
                required
                    .iter()
                    .map(|f| {
                        format!(
                            "{}: {}",
                            snake(f["name"].as_str().unwrap_or("field")),
                            field_type(&f["type"], sdk)
                        )
                    })
                    .collect(),
            );
            let body = join(
                fields
                    .iter()
                    .map(|f| {
                        let label = snake(f["name"].as_str().unwrap_or("field"));
                        format!(
                            "{label}: {}",
                            if f["type"]["kind"] == "option" {
                                "None"
                            } else {
                                &label
                            }
                        )
                    })
                    .collect(),
            );
            format!(
                "pub fn {}_args({parameters}) -> {title}Args {{ {}({body}) }}\n",
                snake(name),
                pascal(input["name"].as_str().unwrap_or("Args"))
            )
        }
        "rescript" => {
            let parameters = join(
                required
                    .iter()
                    .map(|f| format!("~{}", camel(f["name"].as_str().unwrap_or("field"))))
                    .collect(),
            );
            let body = join(
                fields
                    .iter()
                    .map(|f| {
                        let label = camel(f["name"].as_str().unwrap_or("field"));
                        format!(
                            "{label:?}: {}",
                            if f["type"]["kind"] == "option" {
                                "None"
                            } else {
                                &label
                            }
                        )
                    })
                    .collect(),
            );
            if required.is_empty() {
                format!("let {name}Args: {name}Args = {{ {body} }}\n")
            } else {
                format!("let {name}Args = ({parameters}): {name}Args => {{ {body} }}\n")
            }
        }
        _ => String::new(),
    }
}

pub fn javascript_sources(
    alias: &str,
    bytes: &[u8],
    sdk: &str,
) -> Result<std::collections::BTreeMap<String, String>> {
    let contract = contract(alias, bytes)?;
    let module = pascal(alias);
    let functions = contract["functions"]
        .as_array()
        .context("Missing functions")?;
    let mut files = std::collections::BTreeMap::new();
    let mut records = std::collections::BTreeMap::new();
    let mut ffi=format!("// Generated by FluentCI. Do not edit.\nimport * as native from {};\nimport * as flow from 'fluentci:pipeline';\n",serde_json::to_string(&format!("fluentci:dependency/{alias}"))?);
    let mut declarations=match sdk {
        "purescript"=>{ffi.push_str("import {Just, Nothing} from '../Data.Maybe/index.js';\n");format!("-- Generated by FluentCI. Do not edit.\nmodule FluentCI.Modules.{module} where\nimport Prelude\nimport Data.Maybe (Maybe(..))\nimport FluentCI.Flow (Pipeline)\n\n")},
        "typescript"=>"// Generated by FluentCI. Do not edit.\nimport type {Pipeline} from '../flow';\nimport * as bindings from './bindings.mjs';\n".into(),
        "rescript"=>"// Generated by FluentCI. Do not edit.\n".into(),
        "gleam"=>{
            ffi.push_str(&format!("import * as records from './{}.mjs';\nimport {{Some,None}} from '../../gleam_stdlib/gleam/option.mjs';\nimport {{toList}} from '../../gleam_stdlib/gleam.mjs';\n",snake(alias)));
            "// Generated by FluentCI. Do not edit.\nimport gleam/option.{type Option, None}\nimport fluentci/flow.{type Pipeline}\n\n".into()
        }
        _=>anyhow::bail!("Unsupported JavaScript SDK"),
    };
    for function in functions {
        let raw = function["name"].as_str().context("Missing function")?;
        let name = camel(raw);
        let title = pascal(raw);
        let params = function["params"].as_array().context("Missing params")?;
        ensure!(
            params.len() == 1 && params[0]["type"]["kind"] == "record",
            "Pipeline bindings require one named argument record"
        );
        let mut input = params[0]["type"].clone();
        for field in input["fields"].as_array_mut().context("Missing fields")? {
            if field["name"] == "run-dir" && field["type"]["kind"] != "option" {
                field["type"] = json!({"kind":"option","item":field["type"].clone()});
            }
        }
        let fields = input["fields"].as_array().context("Missing fields")?;
        let result = output(function);
        let options = json!({"project":fields.iter().any(|f|f["name"]=="project"),"runDir":fields.iter().any(|f|f["name"]=="run-dir"),"setup":raw=="setup"});
        let encoded = format!(
            "flow.toWire(args,{},{sdk:?})",
            serde_json::to_string(&input)?
        );
        let native_call = format!("native.{name}(args)");
        let call=match sdk {
            "purescript"=>format!("args=>flow.fromWire({native_call},{},'purescript',{{just:x=>new Just(x),nothing:Nothing.value}})",serde_json::to_string(&result)?),
            "gleam"=>format!("args=>flow.fromWire({native_call},{},'gleam',{{...records,just:x=>new Some(x),nothing:new None(),list:toList}})",serde_json::to_string(&result)?),
            _=>format!("args=>{native_call}"),
        };
        let operation = serde_json::to_string(&format!("{alias}.{raw}"))?;
        let doc = function["description"]
            .as_str()
            .unwrap_or("Append this typed module operation.")
            .replace('\n', " ");
        match sdk {
            "purescript" => {
                ffi.push_str(&format!("export const {name}=args=>p=>flow.moduleStep(p,{operation},{encoded},{call},{options});\nexport const {name}With=select=>p=>flow.moduleStep(p,{operation},previous=>{{const args=select(previous);return {encoded};}},{call},{options});\n"));
                declarations.push_str(&format!("type {title}Args = {}\ntype {title}Result = {}\n-- | {doc}\nforeign import {name} :: forall a. {title}Args -> Pipeline a -> Pipeline {title}Result\nforeign import {name}With :: forall a. (a -> {title}Args) -> Pipeline a -> Pipeline {title}Result\n",field_type(&input,sdk),field_type(&result,sdk)));
            }
            "typescript" => {
                ffi.push_str(&format!("export const {name}=(p,args)=>flow.moduleStep(p,{operation},typeof args==='function'?((select)=>previous=>{{const args=select(previous);return {encoded};}})(args):{encoded},{call},{options});\n"));
                declarations.push_str(&format!("export type {title}Args = {};\nexport type {title}Result = {};\n/** {} */\nexport const {name}:<A>(p:Pipeline<A>,args:{title}Args|((previous:A)=>{title}Args))=>Pipeline<{title}Result>=bindings.{name};\n",field_type(&input,sdk),field_type(&result,sdk),doc.replace("*/","* /")));
            }
            "rescript" => {
                ffi.push_str(&format!("export const {name}=(p,args)=>flow.moduleStep(p,{operation},{encoded},{call},{options});\nexport const {name}With=(p,select)=>flow.moduleStep(p,{operation},previous=>{{const args=select(previous);return {encoded};}},{call},{options});\n"));
                declarations.push_str(&format!("type {name}Args = {}\ntype {name}Result = {}\n@module(\"./FluentciModules{module}.mjs\") external {name}: (Flow.t<'a>, {name}Args) => Flow.t<{name}Result> = \"{name}\"\n@module(\"./FluentciModules{module}.mjs\") external {name}With: (Flow.t<'a>, 'a => {name}Args) => Flow.t<{name}Result> = \"{name}With\"\n",field_type(&input,sdk),field_type(&result,sdk)));
            }
            "gleam" => {
                gleam_records(&input, &mut records);
                gleam_records(&result, &mut records);
                let input_name = field_type(&input, sdk);
                let output_name = field_type(&result, sdk);
                if input_name != format!("{title}Args") {
                    declarations.push_str(&format!("pub type {title}Args = {input_name}\n"));
                }
                if output_name != format!("{title}Result") {
                    declarations.push_str(&format!("pub type {title}Result = {output_name}\n"));
                }
                declarations.push_str(&format!("/// {doc}\n@external(javascript, \"./{}_ffi.mjs\", \"{name}\")\npub fn {}(p: Pipeline(a), args: {title}Args) -> Pipeline({title}Result)\n@external(javascript, \"./{}_ffi.mjs\", \"{name}With\")\npub fn {}_with(p: Pipeline(a), args: fn(a) -> {title}Args) -> Pipeline({title}Result)\n",snake(alias),snake(raw),snake(alias),snake(raw)));
                ffi.push_str(&format!("export const {name}=(p,args)=>flow.moduleStep(p,{operation},{encoded},{call},{options});\nexport const {name}With=(p,select)=>flow.moduleStep(p,{operation},previous=>{{const args=select(previous);return {encoded};}},{call},{options});\n"));
            }
            _ => unreachable!(),
        }
        declarations.push_str(&defaults(&name, &title, &input, sdk));
        declarations.push('\n');
    }
    if sdk == "gleam" {
        for (name, value) in records {
            let fields = value["fields"]
                .as_array()
                .context("Missing fields")?
                .iter()
                .map(|field| {
                    format!(
                        "{}: {}",
                        snake(field["name"].as_str().unwrap_or("field")),
                        field_type(&field["type"], sdk)
                    )
                })
                .collect::<Vec<_>>()
                .join(", ");
            declarations.push_str(&format!("pub type {name} {{ {name}({fields}) }}\n"));
        }
    }
    match sdk {
        "purescript" => {
            files.insert(format!("src/FluentCI/Modules/{module}.purs"), declarations);
            files.insert(format!("src/FluentCI/Modules/{module}.js"), ffi);
        }
        "typescript" => {
            files.insert(format!("fluentci_modules/{alias}/index.ts"), declarations);
            files.insert(format!("fluentci_modules/{alias}/bindings.mjs"), ffi);
        }
        "rescript" => {
            files.insert(format!("src/FluentciModules{module}.res"), declarations);
            files.insert(format!("src/FluentciModules{module}.mjs"), ffi);
        }
        "gleam" => {
            files.insert(
                format!("src/fluentci_modules/{}.gleam", snake(alias)),
                declarations,
            );
            files.insert(
                format!("src/fluentci_modules/{}_ffi.mjs", snake(alias)),
                ffi,
            );
        }
        _ => unreachable!(),
    }
    Ok(files)
}

pub fn python_sources(
    alias: &str,
    bytes: &[u8],
) -> Result<std::collections::BTreeMap<String, String>> {
    let contract = contract(alias, bytes)?;
    let module = snake(alias);
    let mut source=format!("# Generated by FluentCI. Do not edit.\nfrom __future__ import annotations\nfrom typing import TypedDict, Required, TypeVar, Callable\nfrom fluentci.flow import Pipeline\nfrom wit_world.imports import {module} as native\nP = TypeVar('P')\n\n");
    for function in contract["functions"]
        .as_array()
        .context("Missing functions")?
    {
        let name = snake(function["name"].as_str().context("Missing name")?);
        let title = pascal(&name);
        let params = function["params"]
            .as_array()
            .context("Missing parameters")?;
        ensure!(
            params.len() == 1 && params[0]["type"]["kind"] == "record",
            "Pipeline binding requires named argument record"
        );
        let input = &params[0]["type"];
        let fields = input["fields"].as_array().context("Missing fields")?;
        source.push_str(&format!("class {title}Args(TypedDict, total=False):\n"));
        if fields.is_empty() {
            source.push_str("    pass\n");
        }
        for field in fields {
            let kind = field_type(&field["type"], "python");
            let label = snake(field["name"].as_str().unwrap_or("field"));
            let optional =
                field["type"]["kind"] == "option" || label == "run_dir" || label == "project";
            source.push_str(&format!(
                "    {label}: {}\n",
                if optional {
                    kind
                } else {
                    format!("Required[{kind}]")
                }
            ));
        }
        let record = pascal(input["name"].as_str().context("Unnamed argument record")?);
        let result = output(function);
        let return_type = if result["kind"] == "record" {
            format!(
                "native.{}",
                pascal(result["name"].as_str().context("Unnamed result record")?)
            )
        } else {
            field_type(&result, "python")
        };
        let args = fields
            .iter()
            .map(|field| {
                let label = snake(field["name"].as_str().unwrap_or("field"));
                format!("{label}=values.get({label:?})")
            })
            .collect::<Vec<_>>()
            .join(", ");
        let has_project = fields.iter().any(|f| f["name"] == "project");
        let has_run = fields.iter().any(|f| f["name"] == "run-dir");
        let pybool = |value| if value { "True" } else { "False" };
        source.push_str(&format!("\ndef {name}(pipeline: Pipeline[P], args: {title}Args | Callable[[P], {title}Args]) -> Pipeline[{return_type}]:\n    return pipeline.module({:?}, args, lambda values: native.{name}(native.{record}({args})), project={}, run_dir={}, setup={})\n\n",format!("{alias}.{name}"),pybool(has_project),pybool(has_run),pybool(name=="setup")));
    }
    Ok(std::collections::BTreeMap::from([(
        format!("fluentci_modules/{module}.py"),
        source,
    )]))
}

pub fn clojurescript_sources(
    alias: &str,
    bytes: &[u8],
) -> Result<std::collections::BTreeMap<String, String>> {
    let contract = contract(alias, bytes)?;
    let module = snake(alias);
    let mut source=format!(";; Generated by FluentCI. Do not edit.\n(ns fluentci-modules.{alias}\n  (:require [\"../../fluentci_modules/{module}/bindings.mjs\" :as native]))\n");
    let mut ffi=format!("// Generated by FluentCI. Do not edit.\nimport * as native from {};\nimport * as flow from 'fluentci:pipeline';\n",serde_json::to_string(&format!("fluentci:dependency/{alias}"))?);
    for function in contract["functions"]
        .as_array()
        .context("Missing functions")?
    {
        let raw = function["name"].as_str().context("Missing name")?;
        let name = camel(raw);
        let params = function["params"]
            .as_array()
            .context("Missing parameters")?;
        ensure!(
            params.len() == 1 && params[0]["type"]["kind"] == "record",
            "Pipeline binding requires named argument record"
        );
        let fields = params[0]["type"]["fields"]
            .as_array()
            .context("Missing fields")?;
        let options = json!({"project":fields.iter().any(|f|f["name"]=="project"),"runDir":fields.iter().any(|f|f["name"]=="run-dir"),"setup":raw=="setup"});
        ffi.push_str(&format!(
            "export const {name}=(p,args)=>flow.moduleStep(p,{},args,native.{name},{});\n",
            serde_json::to_string(&format!("{alias}.{raw}"))?,
            options
        ));
        source.push_str(&format!(
            "(defn {raw}\n  {}\n  [pipeline args]\n  (native/{name} pipeline (if (fn? args) (fn [previous] (clj->js (args (js->clj previous :keywordize-keys true)))) (clj->js args))))\n",
            serde_json::to_string(
                function["description"]
                    .as_str()
                    .unwrap_or("Append this typed module operation to the pipeline.")
            )?
        ));
    }
    Ok(std::collections::BTreeMap::from([
        (format!("src/fluentci_modules/{module}.cljs"), source),
        (format!("fluentci_modules/{module}/bindings.mjs"), ffi),
    ]))
}

fn rust_decode(value: &Value, expression: &str, namespace: &str) -> Result<String> {
    Ok(match value["kind"].as_str().context("Missing type")? {
        "record"=> {
            let fields=value["fields"].as_array().context("Missing fields")?.iter().map(|field|{
                let name=snake(field["name"].as_str().context("Missing field")?);
                Ok(format!("r#{name}: {}",rust_decode(&field["type"],&format!("({expression})[{name:?}]"),namespace)?))
            }).collect::<Result<Vec<_>>>()?.join(",");
            format!("{namespace}::{} {{ {fields} }}",pascal(value["name"].as_str().context("Unnamed record")?))
        }
        "option"=>format!("if ({expression}).is_null() {{ None }} else {{ Some({}) }}",rust_decode(&value["item"],expression,namespace)?),
        "list"=>format!("({expression}).as_array().ok_or_else(|| Error::msg(\"Expected array\"))?.iter().map(|item| -> Result<_, Error> {{Ok({})}}).collect::<Result<Vec<_>,_>>()?",rust_decode(&value["item"],"item",namespace)?),
        "string"|"bool"|"int"|"float"|"bigint"=>format!("serde_json::from_value(({expression}).clone())?"),
        "enum"=>{
            let cases=value["cases"].as_array().context("Missing cases")?.iter().map(|case|{let name=case.as_str().unwrap_or("");format!("Some({name:?})=>{namespace}::{}::{},",pascal(value["name"].as_str().unwrap_or("Enum")),pascal(name))}).collect::<String>();
            format!("match ({expression}).as_str() {{{cases}_=>return Err(Error::msg(\"Invalid enum value\"))}}")
        }
        other=>anyhow::bail!("Unsupported Elixir dependency argument: {other}"),
    })
}
fn rust_encode(value: &Value, expression: &str) -> Result<String> {
    Ok(match value["kind"].as_str().context("Missing type")? {
        "record" => {
            let fields = value["fields"]
                .as_array()
                .context("Missing fields")?
                .iter()
                .map(|field| {
                    let name = snake(field["name"].as_str().context("Missing field")?);
                    Ok(format!(
                        "{name:?}: {}",
                        rust_encode(&field["type"], &format!("({expression}).r#{name}"))?
                    ))
                })
                .collect::<Result<Vec<_>>>()?
                .join(",");
            format!("serde_json::json!({{ {fields} }})")
        }
        "list" => format!(
            "serde_json::Value::Array(({expression}).iter().map(|item|{}).collect())",
            rust_encode(&value["item"], "item")?
        ),
        "option" => format!(
            "({expression}).as_ref().map(|item|{}).unwrap_or(serde_json::Value::Null)",
            rust_encode(&value["item"], "item")?
        ),
        "unit" => "serde_json::Value::Null".into(),
        "string" | "bool" | "int" | "float" | "bigint" => {
            format!("serde_json::json!({expression})")
        }
        other => anyhow::bail!("Unsupported Elixir dependency output: {other}"),
    })
}
pub fn elixir_sources(
    alias: &str,
    bytes: &[u8],
) -> Result<std::collections::BTreeMap<String, String>> {
    let contract = contract(alias, bytes)?;
    let module = pascal(alias);
    let label = snake(alias);
    let namespace = format!("crate::fluentci::dependency_{label}::{label}");
    let mut elixir =
        format!("# Generated by FluentCI. Do not edit.\ndefmodule FluentCI.Modules.{module} do\n");
    let mut rust =
        "// Generated by FluentCI. Do not edit.\nuse fluentci_pdk::component::Error;\n".to_owned();
    for function in contract["functions"]
        .as_array()
        .context("Missing functions")?
    {
        let raw = function["name"].as_str().context("Missing name")?;
        let name = snake(raw);
        let params = function["params"]
            .as_array()
            .context("Missing parameters")?;
        ensure!(
            params.len() == 1 && params[0]["type"]["kind"] == "record",
            "Pipeline binding requires a named argument record"
        );
        elixir.push_str(&format!("  def {name}(pipeline, args \\\\ %{{}}), do: FluentCI.Flow.module_step(pipeline, {alias:?}, {raw:?}, args, JSON.decode!({}))\n",serde_json::to_string(&serde_json::to_string(function)?)?));
        let argument = rust_decode(&params[0]["type"], "input", &namespace)?;
        let invocation = format!("{namespace}::r#{name}(&args)");
        let invocation = if function["output"]["kind"] == "result" {
            format!("{invocation}.map_err(|error|Error::msg(format!(\"{{error:?}}\")))?")
        } else {
            invocation
        };
        let returned = rust_encode(&output(function), "result")?;
        rust.push_str(&format!("pub fn {label}_{name}(input: serde_json::Value) -> Result<serde_json::Value,Error> {{\nlet args={argument};\nlet result={invocation};\nOk({returned})\n}}\n"));
    }
    elixir.push_str("end\n");
    Ok(std::collections::BTreeMap::from([
        (format!("lib/fluentci_modules/{label}.ex"), elixir),
        (format!("fluentci_modules/{label}_pipeline.rs"), rust),
    ]))
}

pub fn sources(
    alias: &str,
    bytes: &[u8],
    sdk: &str,
) -> Result<std::collections::BTreeMap<String, String>> {
    match sdk {
        "rust" => rust_sources(alias, bytes),
        "python" => python_sources(alias, bytes),
        "elixir" => elixir_sources(alias, bytes),
        "clojurescript" => clojurescript_sources(alias, bytes),
        _ => javascript_sources(alias, bytes, sdk),
    }
}

fn rust_type(value: &Value, namespace: &str) -> Result<String> {
    Ok(match value["kind"].as_str().context("Missing type")? {
        "record" | "enum" => format!(
            "{namespace}::{}",
            pascal(value["name"].as_str().context("Unnamed record")?)
        ),
        "option" => format!("Option<{}>", rust_type(&value["item"], namespace)?),
        "list" => format!("Vec<{}>", rust_type(&value["item"], namespace)?),
        "string" => "String".into(),
        "bool" => "bool".into(),
        "int" => match value["wire"].as_str() {
            Some("u8") => "u8",
            Some("u16") => "u16",
            Some("u32") => "u32",
            Some("s8") => "i8",
            Some("s16") => "i16",
            _ => "i32",
        }
        .into(),
        "bigint" => if value["wire"] == "u64" { "u64" } else { "i64" }.into(),
        "float" => if value["wire"] == "f32" { "f32" } else { "f64" }.into(),
        "unit" => "()".into(),
        other => anyhow::bail!("Unsupported Rust output type: {other}"),
    })
}
pub fn rust_sources(
    alias: &str,
    bytes: &[u8],
) -> Result<std::collections::BTreeMap<String, String>> {
    let contract = contract(alias, bytes)?;
    let label = snake(alias);
    let namespace = format!("crate::fluentci::dependency_{label}::{label}");
    let mut source="// Generated by FluentCI. Do not edit.\nuse fluentci_pdk::{flow::Operation,component::Error};\n".to_owned();
    for function in contract["functions"]
        .as_array()
        .context("Missing functions")?
    {
        let raw = function["name"].as_str().context("Missing name")?;
        let name = snake(raw);
        let params = function["params"].as_array().context("Missing params")?;
        ensure!(
            params.len() == 1 && params[0]["type"]["kind"] == "record",
            "Pipeline bindings require named argument records"
        );
        let input = &params[0]["type"];
        let args = rust_type(input, &namespace)?;
        let result = rust_type(&output(function), &namespace)?;
        let mut defaults = String::new();
        for field in input["fields"].as_array().context("Missing fields")? {
            if field["name"] == "project" && field["type"]["kind"] == "option" {
                defaults.push_str(
                    "if args.project.is_none(){args.project=Some(context.project.clone());}\n",
                );
            }
            if field["name"] == "run-dir" {
                if field["type"]["kind"] == "option" {
                    defaults.push_str(
                        "if args.run_dir.is_none(){args.run_dir=Some(context.next_run_dir());}\n",
                    );
                } else {
                    defaults.push_str(
                        "if args.run_dir.is_empty(){args.run_dir=context.next_run_dir();}\n",
                    );
                }
            }
        }
        let call = format!("{namespace}::r#{name}(&args)");
        let call = if function["output"]["kind"] == "result" {
            format!("{call}.map_err(|e|Error::msg(format!(\"{{e:?}}\")))")
        } else {
            format!("Ok({call})")
        };
        let mutable = if defaults.is_empty() { "" } else { "mut " };
        let context = if defaults.is_empty() {
            "_context"
        } else {
            "context"
        };
        source.push_str(&format!("pub fn r#{name}({mutable}args:{args})->Operation<{result}>{{Operation::new(move |{context}|{{{defaults}{call}}})}}\n"));
    }
    Ok(std::collections::BTreeMap::from([(
        format!("fluentci_modules/{label}.rs"),
        source,
    )]))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Vec<u8> {
        wat::parse_str(
            r#"(component
          (core module $m (func (export "add") (param i32 i32 i32) (result i32) local.get 0))
          (core instance $i (instantiate $m))
          (type $args (record (field "left" s32) (field "right" (option s32))))
          (func $add (param "args" $args) (result s32) (canon lift (core func $i "add")))
          (instance $api (export "add-args" (type $args)) (export "add" (func $add)))
          (export "api" (instance $api))
        )"#,
        )
        .unwrap()
    }
    #[test]
    fn generates_named_bindings_for_every_sdk_from_the_same_wit() {
        let bytes = fixture();
        for sdk in [
            "purescript",
            "gleam",
            "typescript",
            "rescript",
            "clojurescript",
            "python",
            "elixir",
            "rust",
        ] {
            let files =
                sources("math", &bytes, sdk).unwrap_or_else(|error| panic!("{sdk}: {error:#}"));
            assert!(!files.is_empty(), "{sdk}");
            assert!(files.values().any(|source| source.contains("add")), "{sdk}");
            assert!(
                files
                    .values()
                    .all(|source| source.contains("Generated by FluentCI")),
                "{sdk}"
            );
        }
    }
    #[test]
    fn records_and_optional_argument_types_come_from_wit() {
        let contract = contract("math", &fixture()).unwrap();
        let fields = &contract["functions"][0]["params"][0]["type"]["fields"];
        assert_eq!(fields[0]["name"], "left");
        assert_eq!(fields[0]["type"]["kind"], "int");
        assert_eq!(fields[1]["type"]["kind"], "option");
    }
}
