use fluentci::workspace::Workspace;
use std::path::Path;

#[test]
fn finds_configuration_from_deeply_nested_packages() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let nested = root.join("apps/backend/src/handlers");
    std::fs::create_dir_all(&nested)?;
    std::fs::write(root.join("fluentci.toml"), "steps=[]")?;
    let workspace = Workspace::discover(&nested)?;
    assert_eq!(workspace.root, root);
    assert_eq!(workspace.config, Some(root.join("fluentci.toml")));
    Ok(())
}

#[test]
fn recognizes_workspace_manifests_before_initialization() -> anyhow::Result<()> {
    for (filename, content) in [
        ("Cargo.toml", "[workspace]\nmembers=[]"),
        ("package.json", r#"{"workspaces":["packages/*"]}"#),
        ("pnpm-workspace.yaml", "packages:\n  - packages/*"),
        ("deno.json", r#"{"workspace":["packages/a"]}"#),
        ("go.work", "go 1.23"),
    ] {
        let temp = tempfile::tempdir()?;
        let root = temp.path().canonicalize()?;
        let nested = root.join("packages/a/src");
        std::fs::create_dir_all(&nested)?;
        std::fs::write(root.join(filename), content)?;
        assert_eq!(Workspace::discover(&nested)?.root, root, "{filename}");
    }
    Ok(())
}

#[test]
fn respects_nested_repository_boundaries_and_local_configs() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    std::fs::write(root.join("fluentci.toml"), "steps=[]")?;
    let child = root.join("vendor/repository");
    let nested = child.join("src");
    std::fs::create_dir_all(&nested)?;
    std::fs::write(child.join(".git"), "gitdir: elsewhere")?;
    let workspace = Workspace::discover(&nested)?;
    assert_eq!(workspace.root, child);
    assert!(workspace.config.is_none());
    std::fs::write(child.join("fluentci.toml"), "steps=[]")?;
    assert_eq!(
        Workspace::discover(&nested)?.config,
        Some(child.join("fluentci.toml"))
    );
    assert_eq!(
        fluentci::workspace::relative_path(Path::new("/a/b"), Path::new("/a/c/module")),
        Path::new("../c/module")
    );
    Ok(())
}
