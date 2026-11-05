//! Pure named cases and Cartesian products. A matrix expands into ordinary tasks.
use crate::{primitives, Plan, Task};
use std::collections::HashSet;

pub const MAX_CASES: usize = 4096;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Case<T> {
    pub key: String,
    pub value: T,
}

fn component(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
pub fn named<T>(name: &str, value: T) -> Case<T> {
    Case {
        key: component(name),
        value,
    }
}
pub fn axis(name: &str, values: Vec<String>) -> Vec<Case<String>> {
    values
        .into_iter()
        .map(|value| Case {
            key: format!("{}={}", component(name), component(&value)),
            value,
        })
        .collect()
}
pub fn product<A: Clone, B: Clone>(
    left: &[Case<A>],
    right: &[Case<B>],
) -> Result<Vec<Case<(A, B)>>, String> {
    if left
        .len()
        .checked_mul(right.len())
        .is_none_or(|count| count > MAX_CASES)
    {
        return Err(format!("matrix expansion exceeds {MAX_CASES} cases"));
    }
    Ok(left
        .iter()
        .flat_map(|a| {
            right.iter().map(move |b| Case {
                key: format!("{},{}", a.key, b.key),
                value: (a.value.clone(), b.value.clone()),
            })
        })
        .collect())
}
pub fn include<T>(mut cases: Vec<Case<T>>, extra: Vec<Case<T>>) -> Vec<Case<T>> {
    cases.extend(extra);
    cases
}
pub fn exclude<T>(cases: Vec<Case<T>>, predicate: impl Fn(&T) -> bool) -> Vec<Case<T>> {
    cases
        .into_iter()
        .filter(|case| !predicate(&case.value))
        .collect()
}
pub fn matrix<T>(
    name: &str,
    cases: Vec<Case<T>>,
    build: impl Fn(T) -> Task,
) -> Result<Vec<Task>, String> {
    if name.is_empty()
        || name.len() > 64
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err("matrix name must contain 1..64 ASCII letters, digits, '.', '_' or '-'".into());
    }
    if cases.len() > MAX_CASES {
        return Err(format!("matrix expansion exceeds {MAX_CASES} cases"));
    }
    let mut keys = HashSet::new();
    for case in &cases {
        if case.key.is_empty() || case.key.contains('\0') || !keys.insert(case.key.clone()) {
            return Err("matrix cases must have unique, nonempty keys without NUL".into());
        }
    }
    Ok(cases
        .into_iter()
        .map(|case| {
            let mut task = build(case.value);
            task.id = format!("{name}[{}]", case.key);
            task
        })
        .collect())
}
/// Preserve existing dependencies and add every parent, including matrix members.
pub fn after(parents: &[Task], mut task: Task) -> Task {
    for parent in parents {
        if !task.needs.contains(&parent.id) {
            task.needs.push(parent.id.clone());
        }
    }
    task
}
pub fn parallel(tasks: Vec<Task>, concurrency: usize) -> Plan {
    primitives::jobs(primitives::plan(tasks), concurrency)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::primitives::exec;
    #[test]
    fn typed_products_filters_stable_ids_and_joins() {
        let cases = product(
            &axis("node", vec!["22".into(), "24".into()]),
            &axis("suite", vec!["unit".into(), "integration".into()]),
        )
        .unwrap();
        let cases = exclude(cases, |(node, suite)| {
            node == "22" && suite == "integration"
        });
        let cases = include(
            cases,
            vec![named("experimental", ("26".into(), "unit".into()))],
        );
        let jobs = matrix("test", cases, |(node, suite)| {
            exec(
                "ignored",
                "/missing-tool",
                vec![node, suite],
                "/missing-workspace",
            )
        })
        .unwrap();
        assert_eq!(jobs.len(), 4);
        assert_eq!(jobs[0].id, "test[node=22,suite=unit]");
        assert_eq!(jobs[3].id, "test[experimental]");
        let join = after(&jobs, exec("join", "/missing-tool", vec![], "."));
        assert_eq!(join.needs.len(), 4);
        assert_eq!(parallel(jobs, 2).jobs, 2);
    }
    #[test]
    fn reject_duplicates_before_invoking_builder_and_bound_expansion() {
        let duplicate = vec![named("same", 1), named("same", 2)];
        assert!(matrix("jobs", duplicate, |_| panic!("builder must not run")).is_err());
        let many = axis("axis", (0..65).map(|i| i.to_string()).collect());
        assert!(product(&many, &many).is_err());
        assert_eq!(named("a,b=世界", ()).key, "a%2Cb%3D%E4%B8%96%E7%95%8C");
    }
    #[cfg(unix)]
    #[test]
    fn resolving_guest_plan_paths_is_pure_and_preserves_explicit_cache_storage() {
        let mut plan = parallel(vec![exec("job", "/missing", vec![], ".")], 2);
        plan.cache_dir = Some("cache".into());
        plan.resource_dir = Some("leases".into());
        plan.resolve_paths(std::path::Path::new("/workspace"))
            .unwrap();
        assert_eq!(plan.tasks[0].cwd, std::path::Path::new("/workspace/."));
        assert_eq!(
            plan.cache_dir.unwrap(),
            std::path::Path::new("/workspace/cache")
        );
        assert_eq!(
            plan.resource_dir.unwrap(),
            std::path::Path::new("/workspace/leases")
        );
    }
}
