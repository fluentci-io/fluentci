//! SDK-neutral typed JSON invocation contract. No guest code runs during validation.

use super::metadata::{Argument, Function, InputFormat};
use anyhow::{bail, ensure, Context, Result};
use serde_json::{Map, Value};
use std::collections::HashSet;

const TYPES: &[&str] = &["string", "integer", "number", "boolean"];

pub fn validate(function: &Function) -> Result<()> {
    if function.input_format != InputFormat::Json {
        return Ok(());
    }
    let args = function
        .args
        .as_ref()
        .context("JSON functions must declare args (use [] for no arguments)")?;
    let mut names = HashSet::new();
    for arg in args {
        ensure!(
            arg.name
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphabetic)
                && arg
                    .name
                    .bytes()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-' || ch == b'_')
                && !matches!(arg.name.as_str(), "help")
                && names.insert(&arg.name),
            "Invalid, reserved, or duplicate named argument {:?}",
            arg.name
        );
        ensure!(TYPES.contains(&arg.type_name.strip_suffix("[]").unwrap_or(&arg.type_name)),
            "Unsupported named argument type {:?}; use string, integer, number, boolean, or their [] array forms", arg.type_name);
    }
    Ok(())
}

fn matches_type(value: &Value, kind: &str) -> bool {
    if let Some(item) = kind.strip_suffix("[]") {
        return value
            .as_array()
            .is_some_and(|values| values.iter().all(|value| matches_type(value, item)));
    }
    match kind {
        "string" => value.as_str().is_some_and(|value| !value.contains('\0')),
        "integer" => value
            .as_i64()
            .is_some_and(|value| i32::try_from(value).is_ok()),
        "number" => value.as_f64().is_some_and(f64::is_finite),
        "boolean" => value.is_boolean(),
        _ => false,
    }
}

fn value(arg: &Argument, raw: &str) -> Result<Value> {
    let parsed = if arg.type_name == "string" {
        Value::String(raw.into())
    } else {
        serde_json::from_str(raw)
            .with_context(|| format!("--{} expects {}", arg.name, arg.type_name))?
    };
    ensure!(
        matches_type(&parsed, &arg.type_name),
        "--{} expects {}",
        arg.name,
        arg.type_name
    );
    Ok(parsed)
}

/// Text exports retain their original input convention; JSON exports bind typed fields.
pub fn encode(function: &Function, words: &[String]) -> Result<String> {
    ensure!(
        function.input_format != InputFormat::Wit,
        "WIT arguments must be bound by the component runtime"
    );
    validate(function)?;
    if function.input_format == InputFormat::Text {
        return Ok(words.join(" "));
    }
    let args = function.args.as_ref().context("Missing JSON arguments")?;
    let mut object = Map::new();
    let mut index = 0;
    let mut positional = false;
    while let Some(word) = words.get(index) {
        index += 1;
        if !positional && word == "--" {
            positional = true;
            continue;
        }
        let (arg, raw) = if !positional && word.starts_with("--") {
            let flag = &word[2..];
            let (name, inline) = flag
                .split_once('=')
                .map_or((flag, None), |(name, raw)| (name, Some(raw)));
            let arg = args.iter().find(|arg| arg.name == name).with_context(|| {
                format!(
                    "Unknown argument --{name}; use {} --help for available arguments",
                    function.name
                )
            })?;
            let raw = if let Some(raw) = inline {
                raw
            } else if arg.type_name == "boolean"
                && !words
                    .get(index)
                    .is_some_and(|word| matches!(word.as_str(), "true" | "false"))
            {
                "true"
            } else {
                let raw = words
                    .get(index)
                    .filter(|word| !word.starts_with("--"))
                    .with_context(|| {
                        format!("Missing value for --{} ({})", arg.name, arg.type_name)
                    })?;
                index += 1;
                raw
            };
            (arg, raw)
        } else {
            let arg = args
                .iter()
                .find(|arg| !object.contains_key(&arg.name))
                .context("Too many positional arguments")?;
            (arg, word.as_str())
        };
        ensure!(
            !object.contains_key(&arg.name),
            "Argument --{} was provided more than once",
            arg.name
        );
        object.insert(arg.name.clone(), value(arg, raw)?);
    }
    for arg in args {
        if arg.required && !object.contains_key(&arg.name) {
            bail!(
                "Missing required argument --{} ({})",
                arg.name,
                arg.type_name
            );
        }
    }
    Ok(serde_json::to_string(&object)?)
}

/// Validate guest input too, including callers that bypass the command-line binder.
pub fn validate_input(function: &Function, input: &str) -> Result<()> {
    anyhow::ensure!(
        function.input_format != InputFormat::Wit,
        "WIT arguments must be validated against the native component signature"
    );
    validate(function)?;
    if function.input_format == InputFormat::Text {
        return Ok(());
    }
    let value: Value = serde_json::from_str(input).context("Expected a JSON argument object")?;
    let object = value
        .as_object()
        .context("Expected a JSON argument object")?;
    let args = function.args.as_ref().context("Missing JSON arguments")?;
    for (name, value) in object {
        let arg = args
            .iter()
            .find(|arg| arg.name == *name)
            .with_context(|| format!("Unknown argument {name:?}"))?;
        ensure!(
            matches_type(value, &arg.type_name),
            "--{} expects {}",
            arg.name,
            arg.type_name
        );
    }
    for arg in args {
        ensure!(
            !arg.required || object.contains_key(&arg.name),
            "Missing required argument --{}",
            arg.name
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn function() -> Function {
        serde_json::from_str(r#"{"name":"build","inputFormat":"json","args":[{"name":"src","type":"string","description":"Source directory"},{"name":"jobs","type":"integer"},{"name":"verbose","type":"boolean","required":false},{"name":"tags","type":"string[]","required":false}]}"#).unwrap()
    }

    fn words(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).into()).collect()
    }

    #[test]
    fn typed_names_preserve_boundaries_and_do_not_evaluate_shell_syntax() -> Result<()> {
        let input = encode(
            &function(),
            &words(&[
                "--jobs=3",
                "--src",
                "space ' quote\n$(touch ignored)",
                "--verbose",
                "--tags",
                "[\"ci\",\"rust\"]",
            ]),
        )?;
        let value: Value = serde_json::from_str(&input)?;
        assert_eq!(value["jobs"], 3);
        assert_eq!(value["src"], "space ' quote\n$(touch ignored)");
        assert_eq!(value["verbose"], true);
        assert_eq!(value["tags"], serde_json::json!(["ci", "rust"]));
        validate_input(&function(), &input)?;
        assert_eq!(
            encode(&function(), &words(&["demo", "2"]))?,
            r#"{"jobs":2,"src":"demo"}"#
        );
        Ok(())
    }

    #[test]
    fn invalid_values_unknown_duplicate_and_missing_flags_are_rejected() {
        for values in [
            vec!["--src", "demo"],
            vec!["--src=demo", "--jobs=no"],
            vec!["--src=demo", "--jobs=1.2"],
            vec!["--src=demo", "--jobs=2147483648"],
            vec!["--src=demo", "--jobs=2", "--unknown=1"],
            vec!["--src=one", "--src=two", "--jobs=2"],
            vec!["--src=demo", "--jobs=2", "--tags=[1]"],
            vec!["--src", "--jobs=2"],
        ] {
            assert!(encode(&function(), &words(&values)).is_err(), "{values:?}");
        }
        assert!(validate_input(&function(), r#"{"src":"a","jobs":"2"}"#).is_err());
        assert!(validate_input(&function(), r#"{"src":"a","jobs":2,"other":true}"#).is_err());
    }

    #[test]
    fn text_exports_keep_custom_flag_parsing_and_named_schema_is_explicit() -> Result<()> {
        let mut function = function();
        function.input_format = InputFormat::Text;
        assert_eq!(
            encode(&function, &words(&["--custom", "a b"]))?,
            "--custom a b"
        );
        function.input_format = InputFormat::Json;
        function.args.as_mut().unwrap()[0].type_name = "String".into();
        assert!(validate(&function).is_err());
        Ok(())
    }
}
