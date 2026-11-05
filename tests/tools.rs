#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    path::Path,
    process::{Command, Output},
};

fn run(root: &Path, path: &Path, arguments: &[&str]) -> anyhow::Result<Output> {
    Ok(Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["--check-update=false", "--database"])
        .arg(root.join("test.db"))
        .args(arguments)
        .current_dir(root)
        .env("PATH", path)
        .env_remove("FLUENTCI_PROJECT_ID")
        .output()?)
}

#[test]
fn reports_all_missing_sdk_tools_before_building() -> anyhow::Result<()> {
    for (sdk, expected, entry) in [
        ("rust", vec!["cargo", "rustc", "rustup"], ""),
        (
            "purescript",
            vec!["node", "npm", "purs", "spago", "extism-js"],
            "",
        ),
        ("typescript", vec!["node", "npm", "extism-js"], ""),
        (
            "clojurescript",
            vec![
                "node",
                "npm",
                "java",
                "clojure",
                "extism-js",
                "wasm-merge",
                "wasm-opt",
            ],
            "",
        ),
        ("gleam", vec!["node", "npm", "gleam", "extism-js"], ""),
        (
            "elixir",
            vec!["mix", "elixir", "cargo", "rustc", "rustup"],
            "entry='Main'",
        ),
        (
            "python",
            vec!["uv", "extism-py", "wasm-merge", "wasm-opt"],
            "",
        ),
        ("rescript", vec!["node", "npm", "rescript", "extism-js"], ""),
    ] {
        let temp = tempfile::tempdir()?;
        let root = temp.path().canonicalize()?;
        std::fs::create_dir_all(root.join(".fluentci/main"))?;
        let empty_path = root.join("empty-bin");
        std::fs::create_dir(&empty_path)?;
        std::fs::write(
            root.join(".fluentci/main/Cargo.toml"),
            "[package]\nname='main'\nversion='0.1.0'\n[lib]\ncrate-type=['cdylib']",
        )?;
        std::fs::write(
            root.join("fluentci.toml"),
            format!("[[modules]]\nname='main'\npath='.fluentci/main'\nsdk='{sdk}'\n{entry}"),
        )?;
        for arguments in [
            vec!["run", "main", "hello"],
            vec!["modules", "main", "--json"],
        ] {
            let output = run(&root, &empty_path, &arguments)?;
            assert!(!output.status.success());
            let error = String::from_utf8_lossy(&output.stderr);
            assert!(error.contains("Missing required tools"), "{sdk}: {error}");
            for tool in &expected {
                assert!(error.contains(tool), "{sdk}: missing {tool} from {error}");
            }
        }
        assert!(!root.join(".fluentci/main/node_modules").exists());
        assert!(!root.join(".fluentci/main/target").exists());
    }
    Ok(())
}

#[test]
fn checks_custom_build_executables() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    std::fs::create_dir_all(root.join(".fluentci/main"))?;
    std::fs::write(
        root.join("fluentci.toml"),
        "[[modules]]\nname='main'\npath='.fluentci/main'\nsdk='typescript'\nbuild=['missing-sdk-build-tool']",
    )?;
    let output = run(
        &root,
        Path::new("/nonexistent-fluentci-tools"),
        &["run", "main", "hello"],
    )?;
    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr)
            .contains("Missing required build tool \"missing-sdk-build-tool\"")
    );
    Ok(())
}

#[cfg(unix)]
#[test]
fn finds_project_local_compilers_and_rechecks_them_on_every_run() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let source = root.join(".fluentci/main");
    let bin = root.join("tools");
    std::fs::create_dir_all(source.join("node_modules/.bin"))?;
    std::fs::create_dir_all(&bin)?;
    for (path, script) in [
        (bin.join("node"), "#!/bin/sh\nexit 0\n"),
        (bin.join("extism-js"), "#!/bin/sh\nexit 0\n"),
        (
            bin.join("npm"),
            "#!/bin/sh\n/bin/mkdir -p dist\n/bin/cp input.wasm dist/plugin.wasm\necho built > build-ran\n",
        ),
        (
            source.join("node_modules/.bin/rescript"),
            "#!/bin/sh\nexit 0\n",
        ),
    ] {
        std::fs::write(&path, script)?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
    }
    std::fs::write(
        source.join("input.wasm"),
        wat::parse_str("(module (func (export \"hello\") (result i32) i32.const 0))")?,
    )?;
    std::fs::write(
        root.join("fluentci.toml"),
        "[[modules]]\nname='main'\npath='.fluentci/main'\nsdk='rescript'",
    )?;
    let output = run(&root, &bin, &["modules", "main", "--json"])?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(source.join("build-ran").exists());
    std::fs::remove_file(source.join("node_modules/.bin/rescript"))?;
    std::fs::remove_file(source.join("build-ran"))?;
    let output = run(&root, &bin, &["modules", "main", "--json"])?;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("rescript"));
    assert!(!source.join("build-ran").exists());
    Ok(())
}
