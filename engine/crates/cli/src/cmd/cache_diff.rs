use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

struct Snapshot {
    key: Option<String>,
    components: BTreeMap<String, String>,
}

fn digest(value: &Value) -> Result<String> {
    let value = value
        .as_str()
        .ok_or_else(|| anyhow!("cache digest must be a string"))?;
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        bail!("invalid cache digest");
    }
    Ok(value.into())
}

fn read(path: &Path) -> Result<BTreeMap<String, Snapshot>> {
    let path = if path.is_dir() {
        path.join("result.json")
    } else {
        path.into()
    };
    let report: Value = serde_json::from_slice(
        &fs::read(&path).with_context(|| format!("read {}", path.display()))?,
    )
    .context("invalid result JSON")?;
    let tasks = report
        .get("tasks")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("result requires a tasks array"))?;
    let mut snapshots = BTreeMap::new();
    for task in tasks {
        let id = task
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| anyhow!("task requires a nonempty id"))?;
        let cache = task
            .get("cache")
            .and_then(Value::as_object)
            .ok_or_else(|| anyhow!("task requires a cache result"))?;
        let key = match cache.get("key") {
            Some(Value::Null) => None,
            Some(value) => Some(digest(value)?),
            None => bail!("cache result requires a key field"),
        };
        let raw = cache
            .get("components")
            .and_then(Value::as_object)
            .ok_or_else(|| anyhow!("cache result requires components"))?;
        let components = raw
            .iter()
            .map(|(name, value)| Ok((name.clone(), digest(value)?)))
            .collect::<Result<BTreeMap<_, _>>>()?;
        if snapshots
            .insert(id.into(), Snapshot { key, components })
            .is_some()
        {
            bail!("duplicate task id in result");
        }
    }
    Ok(snapshots)
}

pub fn compare(before: &Path, after: &Path, as_json: bool) -> Result<()> {
    let before = read(before).context("read baseline result")?;
    let after = read(after).context("read current result")?;
    let ids: BTreeSet<_> = before.keys().chain(after.keys()).collect();
    let mut tasks = Vec::new();
    for id in ids {
        let mut changed = Vec::new();
        let status = match (before.get(id), after.get(id)) {
            (None, Some(_)) => "added",
            (Some(_), None) => "removed",
            (Some(old), Some(new)) => {
                let names: BTreeSet<_> =
                    old.components.keys().chain(new.components.keys()).collect();
                for name in names {
                    if old.components.get(name) != new.components.get(name) {
                        changed.push(name.clone());
                    }
                }
                if old.key.is_none() || new.key.is_none() {
                    "unavailable"
                } else if old.key == new.key && changed.is_empty() {
                    "unchanged"
                } else {
                    "changed"
                }
            }
            (None, None) => unreachable!(),
        };
        tasks.push(json!({"id": id, "status": status, "changed_components": changed}));
    }
    if as_json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"version": 1, "tasks": tasks}))?
        );
    } else {
        for task in tasks {
            // JSON quoting keeps control characters in task/component names from
            // becoming terminal escapes. Neither values nor raw errors are printed.
            println!(
                "{}: {}{}",
                task["id"],
                task["status"].as_str().unwrap(),
                if task["changed_components"].as_array().unwrap().is_empty() {
                    String::new()
                } else {
                    format!(" {}", task["changed_components"])
                }
            );
        }
    }
    Ok(())
}
