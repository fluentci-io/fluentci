//! Git-aware task selection. Selection never substitutes for content-based cache validation.

use crate::{cache, graph::DependencyGraph, Plan};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    ffi::OsString,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Debug)]
pub struct GitOptions {
    pub base: String,
    pub head: String,
    pub include_worktree: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Changes {
    pub root: PathBuf,
    pub base: String,
    pub head: String,
    pub files: Vec<PathBuf>,
    pub includes_worktree: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Reason {
    Requested,
    InputChanged { path: PathBuf },
    GlobalInputChanged { path: PathBuf },
    UndeclaredInputs,
    ExternalInput,
    DependencyAffected { task: String },
    RequiredDependency { task: String },
    Unaffected,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Decision {
    pub id: String,
    pub selected: bool,
    pub reason: Reason,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Selection {
    /// Binary plan identity prevents accidentally applying a stale selection.
    pub plan_key: String,
    pub tasks: Vec<Decision>,
}

impl Changes {
    /// Compare the merge base with head; optionally include staged, unstaged and
    /// untracked (non-ignored) paths. NUL framing preserves spaces and newlines.
    pub fn discover(directory: &Path, options: &GitOptions) -> Result<Self, String> {
        let root = git(directory, &["rev-parse", "--show-toplevel"])?;
        let root = path(root.strip_suffix(b"\n").unwrap_or(&root))?;
        let root = root.canonicalize().map_err(|error| error.to_string())?;
        let resolve = |reference: &str| -> Result<String, String> {
            let revision = format!("{reference}^{{commit}}");
            let value = git(
                &root,
                &["rev-parse", "--verify", "--end-of-options", &revision],
            )?;
            String::from_utf8(value)
                .map(|value| value.trim().to_owned())
                .map_err(|error| error.to_string())
        };
        let head = resolve(&options.head)?;
        let base = resolve(&options.base)?;
        let base = String::from_utf8(git(&root, &["merge-base", &base, &head])?)
            .map_err(|error| error.to_string())?
            .trim()
            .to_owned();
        let diff = |from: &str, to: Option<&str>| {
            let mut args = vec![
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-renames",
                "--name-only",
                "-z",
                from,
            ];
            args.extend(to);
            args.push("--");
            git(&root, &args)
        };
        let mut files = paths(&diff(&base, Some(&head))?)?;
        if options.include_worktree {
            files.extend(paths(&diff(&head, None)?)?);
            files.extend(paths(&git(
                &root,
                &["ls-files", "--others", "--exclude-standard", "-z", "--"],
            )?)?);
        }
        Ok(Self {
            root,
            base,
            head,
            files: files.into_iter().collect(),
            includes_worktree: options.include_worktree,
        })
    }
}

impl Selection {
    pub fn all(plan: &Plan) -> Result<Self, String> {
        plan.validate()?;
        Ok(Self {
            plan_key: plan_key(plan)?,
            tasks: plan
                .tasks
                .iter()
                .map(|task| Decision {
                    id: task.id.clone(),
                    selected: true,
                    reason: Reason::Requested,
                })
                .collect(),
        })
    }

    /// Build an ownership index, propagate changes downstream, then retain every
    /// prerequisite. No recursion or all-pairs task/file scan is needed.
    pub fn affected(
        plan: &Plan,
        root: &Path,
        files: &[PathBuf],
        global_inputs: &[PathBuf],
    ) -> Result<Self, String> {
        // Validate the original graph: pruning must never hide invalid tasks.
        let validated = plan.validate()?;
        let graph = if plan.has_package_tasks() {
            DependencyGraph::from_tasks(&plan.tasks)?
        } else {
            validated
        };
        let root = root.canonicalize().map_err(|error| error.to_string())?;
        for file in files.iter().chain(global_inputs) {
            if !cache::safe_relative(file) {
                return Err(
                    "affected paths must be repository-relative without '.' or '..'".into(),
                );
            }
        }
        let mut reasons = vec![None; plan.tasks.len()];
        let mut owners: BTreeMap<PathBuf, Vec<usize>> = BTreeMap::new();
        for (index, task) in plan.tasks.iter().enumerate() {
            let Some(policy) = &task.cache else {
                // Absence of declarations means unknown inputs, not no inputs.
                reasons[index] = Some(Reason::UndeclaredInputs);
                continue;
            };
            let cwd = if let Some(workspace) = &plan.workspace {
                workspace.source.join(&task.cwd)
            } else {
                task.cwd.clone()
            };
            let cwd = cache::resolved_location(&cwd)?;
            let inputs = policy
                .inputs
                .iter()
                .map(|input| cwd.join(input))
                .chain(task.env_files.iter().map(|input| cwd.join(input)))
                .chain(policy.toolchain_files.iter().cloned());
            for input in inputs {
                let input = cache::resolved_location(&input)?;
                match input.strip_prefix(&root) {
                    Ok(relative) if cache::safe_relative(relative) => {
                        owners.entry(relative.to_owned()).or_default().push(index);
                    }
                    _ => reasons[index] = Some(Reason::ExternalInput),
                }
            }
        }
        let globals = global_inputs.iter().cloned().collect::<BTreeSet<_>>();
        for file in files {
            if file.ancestors().any(|ancestor| globals.contains(ancestor))
                || globals
                    .range(file.clone()..)
                    .next()
                    .is_some_and(|global| global.starts_with(file))
            {
                for reason in &mut reasons {
                    *reason = Some(Reason::GlobalInputChanged { path: file.clone() });
                }
                break;
            }
            let mut mark = |indices: &[usize]| {
                for &index in indices {
                    reasons[index]
                        .get_or_insert_with(|| Reason::InputChanged { path: file.clone() });
                }
            };
            for ancestor in file.ancestors() {
                if let Some(indices) = owners.remove(ancestor) {
                    mark(&indices);
                }
            }
            // A changed directory/submodule also affects tracked roots below it.
            // Remove roots after their first match: a shared source directory
            // changed in 10,000 files must not revisit all its owners 10,000 times.
            let descendants = owners
                .range(file.clone()..)
                .take_while(|(input, _)| input.starts_with(file))
                .map(|(input, _)| input.clone())
                .collect::<Vec<_>>();
            for input in descendants {
                mark(&owners.remove(&input).expect("indexed input"));
            }
        }
        let mut queue = reasons
            .iter()
            .enumerate()
            .filter_map(|(index, reason)| reason.as_ref().map(|_| index))
            .collect::<VecDeque<_>>();
        propagate(&graph.successors, plan, &mut reasons, &mut queue, false);
        // Only downstream-affected tasks expand to their prerequisites. Adding
        // an unchanged prerequisite must not select its unrelated consumers.
        queue.extend(
            reasons
                .iter()
                .enumerate()
                .filter_map(|(index, reason)| reason.as_ref().map(|_| index)),
        );
        propagate(&graph.dependencies, plan, &mut reasons, &mut queue, true);
        Ok(Self {
            plan_key: plan_key(plan)?,
            tasks: plan
                .tasks
                .iter()
                .zip(reasons)
                .map(|(task, reason)| Decision {
                    id: task.id.clone(),
                    selected: reason.is_some(),
                    reason: reason.unwrap_or(Reason::Unaffected),
                })
                .collect(),
        })
    }

    pub fn apply(&self, plan: &Plan) -> Result<Plan, String> {
        if self.plan_key != plan_key(plan)?
            || self.tasks.len() != plan.tasks.len()
            || self
                .tasks
                .iter()
                .zip(&plan.tasks)
                .any(|(decision, task)| decision.id != task.id)
        {
            return Err("affected selection does not match the plan".into());
        }
        let mut selected = plan.clone();
        selected.tasks = plan
            .tasks
            .iter()
            .zip(&self.tasks)
            .filter(|(_, decision)| decision.selected)
            .map(|(task, _)| task.clone())
            .collect();
        DependencyGraph::from_tasks(&selected.tasks)?;
        Ok(selected)
    }
}

fn plan_key(plan: &Plan) -> Result<String, String> {
    let encoded = rmp_serde::to_vec_named(&("fluentci-selection-v1", plan))
        .map_err(|error| error.to_string())?;
    Ok(hex::encode(Sha256::digest(encoded)))
}

fn propagate(
    edges: &crate::graph::Edges,
    plan: &Plan,
    reasons: &mut [Option<Reason>],
    queue: &mut VecDeque<usize>,
    prerequisites: bool,
) {
    while let Some(node) = queue.pop_front() {
        for &next in &edges[node] {
            if reasons[next].is_none() {
                reasons[next] = Some(if prerequisites {
                    Reason::RequiredDependency {
                        task: plan.tasks[node].id.clone(),
                    }
                } else {
                    Reason::DependencyAffected {
                        task: plan.tasks[node].id.clone(),
                    }
                });
                queue.push_back(next);
            }
        }
    }
}

fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|error| format!("Git affected detection: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Git affected detection failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(output.stdout)
}

fn paths(bytes: &[u8]) -> Result<BTreeSet<PathBuf>, String> {
    bytes
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .map(path)
        .collect()
}

fn path(bytes: &[u8]) -> Result<PathBuf, String> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Ok(PathBuf::from(OsString::from_vec(bytes.to_vec())))
    }
    #[cfg(not(unix))]
    {
        String::from_utf8(bytes.to_vec())
            .map(PathBuf::from)
            .map_err(|error| error.to_string())
    }
}
