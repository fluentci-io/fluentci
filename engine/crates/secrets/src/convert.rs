use anyhow::{bail, Result};
use serde_json::Value;

pub fn as_valid_env_name(name: String) -> Result<String> {
    let is_valid = |c: char| c.is_ascii_alphanumeric() || c == '_';
    if !name.is_empty()
        && name.chars().all(is_valid)
        && name
            .chars()
            .next()
            .map_or(false, |c| c.is_ascii_alphabetic())
    {
        Ok(name)
    } else {
        bail!("secret name '{}' is invalid", name)
    }
}

#[allow(dead_code)]
pub fn value_as_string(name: &str, v: Value) -> Result<String> {
    match v {
        Value::String(s) => Ok(s),
        Value::Bool(b) => Ok(format!("{b}")),
        Value::Number(n) => Ok(format!("{n}")),
        Value::Null => Ok("null".to_string()),
        _ => bail!("secret '{}' value is not convertible", name),
    }
}

#[allow(dead_code)]
pub fn convert_env_name(prefix: &str, name: &str) -> Result<String> {
    let name = name[prefix.len()..].replace('-', "_");
    as_valid_env_name(name)
}

#[allow(dead_code)]
pub fn decode_env_from_json(name: &str, value: Value) -> Result<Vec<(String, String)>> {
    match value {
        Value::Object(m) => m
            .into_iter()
            .map(|(k, v)| Ok((as_valid_env_name(k)?, value_as_string(name, v)?)))
            .collect(),
        _ => bail!(
            "top-level value for secret '{}' must be a JSON object",
            name
        ),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::collections::HashMap;

    use super::*;

    macro_rules! assert_invalid_secret {
        ($a:expr) => {
            assert!(matches!($a, Err(_)));
        };
    }

    #[test]
    fn as_valid_env_name_correct() {
        macro_rules! assert_convert {
            ($a:expr) => {
                assert_eq!($a, as_valid_env_name($a.to_string()).unwrap());
            };
        }

        assert_convert!("abc");
        assert_convert!("abc123");
        assert_convert!("ab_12_ab");
    }

    #[test]
    fn as_valid_env_name_invalid() {
        macro_rules! assert_fail {
            ($a:expr) => {
                assert_invalid_secret!(as_valid_env_name($a.to_string()));
            };
        }

        assert_fail!("");
        assert_fail!("123abc");
        assert_fail!("ab!");
        assert_fail!("ab-ab");
    }

    #[test]
    fn value_as_string_for_normal_values() {
        macro_rules! assert_convert {
            ($a:expr, $b:expr) => {
                assert_eq!($a, value_as_string("ignored", $b).unwrap());
            };
        }

        assert_convert!("abcd", json!("abcd"));
        assert_convert!("12", json!(12));
        assert_convert!("12.123", json!(12.123));
        assert_convert!("null", json!(null));
        assert_convert!("false", json!(false));
        assert_convert!("true", json!(true));
    }

    #[test]
    fn value_as_string_for_arrays_and_objects() {
        macro_rules! assert_fail {
            ($a:expr) => {
                assert_invalid_secret!(value_as_string("ignored", $a));
            };
        }

        assert_fail!(json!({ "a": 123 }));
        assert_fail!(json!([1, 2]));
    }

    #[test]
    fn decode_env_from_json_correct_values() {
        macro_rules! assert_decode {
            ($a:expr, $($name:ident = $value:expr),*) => {
                #[allow(unused_variables, unused_mut)]
                {
                    let decoded = decode_env_from_json("ignored", $a).unwrap();
                    let len = decoded.len();
                    let mapped = decoded.into_iter().collect::<HashMap<_, _>>();
                    let mut total = 0;
                    $(
                        total += 1;
                        let name = stringify!($name);
                        let value = $value.to_string();
                        assert_eq!(Some(&value), mapped.get(&name[..]));
                    )*
                    assert_eq!(total, len);
                }
            };
        }

        assert_decode!(json!({}),);
        assert_decode!(json!({"a": 1}), a = "1");
        assert_decode!(json!({"a": 1, "b": true}), a = "1", b = "true");
        assert_decode!(
            json!({"a": 1, "b": true, "c": "test"}),
            a = "1",
            b = "true",
            c = "test"
        );
    }

    #[test]
    fn decode_env_from_json_invalid() {
        macro_rules! assert_fail {
            ($a:expr) => {
                assert_invalid_secret!(decode_env_from_json("ignored", $a));
            };
        }

        assert_fail!(json!([1, 2]));
        assert_fail!(json!("test"));
        assert_fail!(json!(false));
        assert_fail!(json!(true));
        assert_fail!(json!({"a!": 1}));
        assert_fail!(json!({"1a": 1}));
        assert_fail!(json!({"a": {"b": 1}}));
    }

    #[test]
    fn convert_env_name_converts_names() {
        macro_rules! assert_convert {
            ($a:expr, $b:expr) => {
                assert_convert!("", $a, $b);
            };
            ($prefix:expr, $a:expr, $b:expr) => {
                assert_eq!($a, convert_env_name($prefix, $b).unwrap());
            };
        }

        assert_convert!("abc", "abc");
        assert_convert!("abc123", "abc123");
        assert_convert!("abc_123", "abc-123");
        assert_convert!("abc__123", "abc--123");
        assert_convert!("abc_123", "abc_123");

        assert_convert!("zxc", "abc", "zxcabc");
        assert_convert!("zxc", "abc", "abcabc");
    }

    #[test]
    fn convert_env_name_invalid() {
        macro_rules! assert_fail {
            ($a:expr) => {
                assert_fail!("", $a);
            };
            ($prefix:expr, $a:expr) => {
                assert_invalid_secret!(convert_env_name($prefix, $a));
            };
        }

        assert_fail!("");
        assert_fail!("!");
        assert_fail!("abc!");
        assert_fail!("123abc");
        assert_fail!("abc", "abc");
    }
}
