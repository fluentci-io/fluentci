#![cfg(unix)]

use fluentci_executor::{
    affected::{Changes, GitOptions, Reason, Selection},
    Cancellation, Plan,
};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn task(id: &str, cwd: &Path, input: &str, needs: &[&str]) -> serde_json::Value {
    json!({"id":id,"cwd":cwd,"program":"/bin/sh","args":["-c","cat source > output"],"needs":needs,
        "cache":{"inputs":[input],"outputs":["output"],"toolchain":"fixture-v1"}})
}

fn plan(tasks: Vec<serde_json::Value>) -> Plan {
    let cache = Path::new(tasks[0]["cwd"].as_str().unwrap()).join(".cache");
    serde_json::from_value(json!({"tasks":tasks,"inherit_env":false,"cache_dir":cache})).unwrap()
}

fn selected(selection: &Selection) -> Vec<&str> {
    selection
        .tasks
        .iter()
        .filter(|decision| decision.selected)
        .map(|decision| decision.id.as_str())
        .collect()
}

#[test]
fn downstream_selection_retains_prerequisites_without_selecting_their_other_consumers() {
    let root = tempfile::tempdir().unwrap();
    for name in ["tools", "lib", "app", "test", "unrelated"] {
        fs::create_dir(root.path().join(name)).unwrap();
        fs::write(root.path().join(name).join("source"), name).unwrap();
    }
    let p = plan(vec![
        task("tools", &root.path().join("tools"), "source", &[]),
        task("lib", &root.path().join("lib"), "source", &["tools"]),
        task("app", &root.path().join("app"), "source", &["lib"]),
        task("test", &root.path().join("test"), "source", &["app"]),
        task(
            "unrelated",
            &root.path().join("unrelated"),
            "source",
            &["tools"],
        ),
    ]);
    let selection = Selection::affected(&p, root.path(), &["lib/source".into()], &[]).unwrap();
    assert_eq!(selected(&selection), ["tools", "lib", "app", "test"]);
    assert!(matches!(&selection.tasks[0].reason, Reason::RequiredDependency {task} if task=="lib"));
    assert!(matches!(&selection.tasks[2].reason, Reason::DependencyAffected {task} if task=="lib"));
    assert_eq!(selection.apply(&p).unwrap().tasks.len(), 4);
    assert!(Selection::affected(&p, root.path(), &["../escape".into()], &[]).is_err());
}

#[test]
fn deleted_nested_inputs_globals_and_unknown_inputs_are_conservative() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join("src/deep")).unwrap();
    let mut unknown = task("unknown", root.path(), "source", &[]);
    unknown.as_object_mut().unwrap().remove("cache");
    let p = plan(vec![task("known", root.path(), "src", &[]), unknown]);
    let none = Selection::affected(&p, root.path(), &[], &[]).unwrap();
    assert_eq!(selected(&none), ["unknown"]);
    let deleted = Selection::affected(&p, root.path(), &["src/deep/deleted".into()], &[]).unwrap();
    assert_eq!(selected(&deleted), ["known", "unknown"]);
    let global = Selection::affected(
        &p,
        root.path(),
        &["Cargo.lock".into()],
        &["Cargo.lock".into()],
    )
    .unwrap();
    assert!(global
        .tasks
        .iter()
        .all(|decision| matches!(decision.reason, Reason::GlobalInputChanged { .. })));
    let mut invalid = p.clone();
    invalid.tasks[0].needs = vec!["missing".into()];
    assert!(Selection::affected(&invalid, root.path(), &[], &[]).is_err());
    assert!(none.apply(&invalid).is_err());
}

#[test]
fn environment_files_toolchain_files_and_external_inputs_are_tracked() {
    let root = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    fs::write(root.path().join("vars.env"), "KEY=value").unwrap();
    fs::write(root.path().join("tool"), "tool").unwrap();
    fs::write(external.path().join("tool"), "external").unwrap();
    let mut p = plan(vec![
        task("env", root.path(), "source", &[]),
        task("external", root.path(), "source", &[]),
    ]);
    p.tasks[0].env_files = vec!["vars.env".into()];
    p.tasks[0].cache.as_mut().unwrap().toolchain_files = vec![root.path().join("tool")];
    p.tasks[1].cache.as_mut().unwrap().toolchain_files = vec![external.path().join("tool")];
    p.tasks[1].cache.as_mut().unwrap().outputs = vec!["other-output".into()];
    for file in ["vars.env", "tool"] {
        let selection = Selection::affected(&p, root.path(), &[file.into()], &[]).unwrap();
        assert_eq!(selected(&selection), ["env", "external"]);
        assert_eq!(selection.tasks[1].reason, Reason::ExternalInput);
    }
}

fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(["-c", "commit.gpgsign=false", "-C"])
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().into()
}

fn repository(root: &Path) {
    git(root, &["init", "-b", "main"]);
    git(root, &["config", "user.name", "Fixture"]);
    git(root, &["config", "user.email", "fixture@example.com"]);
}

#[test]
fn git_uses_merge_base_and_preserves_deleted_renamed_and_untracked_paths() {
    let root = tempfile::tempdir().unwrap();
    repository(root.path());
    fs::write(root.path().join("old name\nfile"), "source").unwrap();
    fs::write(root.path().join("deleted"), "deleted").unwrap();
    fs::write(root.path().join(".gitignore"), "ignored\n").unwrap();
    git(root.path(), &["add", "."]);
    git(root.path(), &["commit", "-m", "base"]);
    git(root.path(), &["checkout", "-b", "feature"]);
    git(root.path(), &["mv", "old name\nfile", "new name\nfile"]);
    git(root.path(), &["rm", "deleted"]);
    git(root.path(), &["commit", "-m", "feature"]);
    let head = git(root.path(), &["rev-parse", "HEAD"]);
    git(root.path(), &["checkout", "main"]);
    fs::write(root.path().join("main-only"), "not part of feature").unwrap();
    git(root.path(), &["add", "."]);
    git(root.path(), &["commit", "-m", "main"]);
    git(root.path(), &["checkout", "feature"]);
    fs::write(root.path().join("untracked"), "new").unwrap();
    fs::write(root.path().join("ignored"), "ignored").unwrap();
    fs::write(root.path().join("staged"), "staged").unwrap();
    git(root.path(), &["add", "staged"]);
    fs::write(root.path().join("new name\nfile"), "dirty").unwrap();
    let mut options = GitOptions {
        base: "main".into(),
        head: "feature".into(),
        include_worktree: true,
    };
    let changes = Changes::discover(root.path(), &options).unwrap();
    assert_eq!(changes.head, head);
    for name in [
        "old name\nfile",
        "new name\nfile",
        "deleted",
        "untracked",
        "staged",
    ] {
        assert!(changes.files.contains(&PathBuf::from(name)), "{name}");
    }
    assert!(!changes.files.contains(&"main-only".into()));
    assert!(!changes.files.contains(&"ignored".into()));
    options.include_worktree = false;
    let committed = Changes::discover(root.path(), &options).unwrap();
    assert!(!committed.files.contains(&"untracked".into()));
    assert!(!committed.files.contains(&"staged".into()));
    options.base = "--help".into();
    assert!(Changes::discover(root.path(), &options).is_err());
}

#[test]
fn affected_execution_still_verifies_content_and_restores_outputs() {
    let root = tempfile::tempdir().unwrap();
    for name in ["left", "right"] {
        fs::create_dir(root.path().join(name)).unwrap();
        fs::write(root.path().join(name).join("source"), name).unwrap();
    }
    let p = plan(vec![
        task("left", &root.path().join("left"), "source", &[]),
        task("right", &root.path().join("right"), "source", &[]),
    ]);
    p.execute(&root.path().join("cold"), &Cancellation::default())
        .unwrap();
    fs::remove_file(root.path().join("left/output")).unwrap();
    let selected = Selection::affected(&p, root.path(), &["left/source".into()], &[])
        .unwrap()
        .apply(&p)
        .unwrap();
    let warm = selected
        .clone()
        .compile()
        .unwrap()
        .execute(&root.path().join("warm"), &Cancellation::default())
        .unwrap();
    assert_eq!(warm.tasks.len(), 1);
    assert_eq!(warm.tasks[0].cache.outcome, "hit");
    assert_eq!(
        fs::read_to_string(root.path().join("left/output")).unwrap(),
        "left"
    );
    fs::write(root.path().join("left/source"), "changed").unwrap();
    let changed = selected
        .execute(&root.path().join("changed"), &Cancellation::default())
        .unwrap();
    assert_eq!(changed.tasks[0].cache.outcome, "stored");
    assert_eq!(
        fs::read_to_string(root.path().join("left/output")).unwrap(),
        "changed"
    );
}

#[test]
fn wide_ownership_index_and_dependency_closure_scale_without_recursion() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("src")).unwrap();
    let tasks = (0..10_000)
        .map(|index| {
            let mut task = task(
                &format!("t{index}"),
                root.path(),
                &format!("src/{index}"),
                &[],
            );
            task["cache"]["outputs"] = json!([format!("out/{index}")]);
            task
        })
        .collect();
    let p = plan(tasks);
    let selection = Selection::affected(&p, root.path(), &["src/9999".into()], &[]).unwrap();
    assert_eq!(selected(&selection), ["t9999"]);
}
