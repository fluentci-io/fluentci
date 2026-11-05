use fluentci::config::{Config, Sdk};
use std::{
    io::{BufRead, BufReader, Write},
    net::TcpListener,
    path::Path,
    process::{Command, Output},
};

fn cli(root: &Path, cwd: &Path, arguments: &[&str]) -> anyhow::Result<Output> {
    Ok(Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["--check-update=false", "--database"])
        .arg(root.join("test.db"))
        .args(arguments)
        .current_dir(cwd)
        .env_remove("FLUENTCI_PROJECT_ID")
        .output()?)
}

fn success(output: &Output) {
    assert!(
        output.status.success(),
        "stdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn wasm(path: &Path, export: &str) -> anyhow::Result<()> {
    std::fs::create_dir_all(path.parent().unwrap())?;
    std::fs::write(
        path,
        wat::parse_str(format!(
            "(module (memory (export \"memory\") 1) (func (export \"{export}\") (result i32) i32.const 0))"
        ))?,
    )?;
    Ok(())
}

#[test]
fn discovery_hides_runtime_exports_for_every_sdk() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path();
    std::fs::write(
        root.join("plugin.wasm"),
        wat::parse_str(
            r#"(module
                (memory (export "memory") 1)
                (func (export "__invoke"))
                (func (export "__conv_pipeline"))
                (func (export "PyInit_extism_ffi"))
                (func (export "_start"))
                (func (export "_initialize"))
                (func (export "check"))
                (func (export "_custom")))"#,
        )?,
    )?;
    let sdks = [
        "rust",
        "purescript",
        "elixir",
        "gleam",
        "typescript",
        "python",
        "rescript",
    ];
    let configuration: String = sdks
        .iter()
        .map(|sdk| format!("[[modules]]\nname='{sdk}'\npath='plugin.wasm'\nsdk='{sdk}'\n"))
        .collect();
    std::fs::write(root.join("fluentci.toml"), configuration)?;
    for command in ["modules", "inspect"] {
        let output = cli(root, root, &[command])?;
        success(&output);
        let text = String::from_utf8(output.stdout)?;
        assert!(text.contains("  check\n"));
        assert!(text.contains("  _custom\n"));
        for hidden in [
            "__invoke",
            "__conv_pipeline",
            "PyInit_extism_ffi",
            "_start",
            "_initialize",
        ] {
            assert!(!text.contains(hidden), "{command} exposed {hidden}");
        }

        let output = cli(root, root, &[command, "--json"])?;
        success(&output);
        let listing: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let modules = listing["modules"].as_array().unwrap();
        assert_eq!(modules.len(), sdks.len());
        for (module, sdk) in modules.iter().zip(sdks) {
            assert_eq!(module["sdk"], sdk);
            assert_eq!(module["functions"], serde_json::json!(["_custom", "check"]));
        }
    }
    Ok(())
}

#[test]
fn invokes_and_discovers_multiple_modules_from_nested_directories() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let nested = root.join("apps/backend/src");
    std::fs::create_dir_all(&nested)?;
    wasm(&root.join(".fluentci/lint.wasm"), "check")?;
    wasm(&root.join(".fluentci/build.wasm"), "compile")?;
    std::fs::write(
        root.join("fluentci.toml"),
        "[[modules]]\nname='lint'\npath='.fluentci/lint.wasm'\n[[modules]]\nname='build'\npath='.fluentci/build.wasm'\n[[steps]]\nname='check'\ncommand='fluentci run lint check'\nworking_directory='apps/backend'",
    )?;
    for arguments in [
        vec!["run", "lint", "check"],
        vec!["run", "--wasm", "build", "compile"],
        vec!["run", ".", "check"],
    ] {
        success(&cli(&root, &nested, &arguments)?);
    }
    let output = cli(&root, &nested, &["modules", "--json"])?;
    success(&output);
    let listing: serde_json::Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(listing["workspace"].as_str(), root.to_str());
    assert_eq!(
        listing["modules"][0]["functions"],
        serde_json::json!(["check"])
    );
    assert_eq!(
        listing["modules"][1]["functions"],
        serde_json::json!(["compile"])
    );
    let output = cli(&root, &nested, &["inspect", "lint", "--json"])?;
    success(&output);
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&output.stdout)?["modules"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let output = cli(&root, &nested, &["run", "--wasm", ".", "check"])?;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("Multiple modules"));
    Ok(())
}

#[test]
fn initializes_every_sdk_and_adds_modules_without_replacing_configuration() -> anyhow::Result<()> {
    for (sdk, filename) in [
        ("rust", "Cargo.toml"),
        ("typescript", "entry.ts"),
        ("purescript", "spago.yaml"),
        ("gleam", "gleam.toml"),
        ("elixir", "mix.exs"),
        ("python", "plugin.py"),
        ("rescript", "rescript.json"),
    ] {
        let temp = tempfile::tempdir()?;
        let root = temp.path().canonicalize()?;
        let nested = root.join("packages/app/src");
        std::fs::create_dir_all(&nested)?;
        std::fs::write(
            root.join("package.json"),
            r#"{"workspaces":["packages/*"]}"#,
        )?;
        success(&cli(&root, &nested, &["init", "--sdk", sdk])?);
        assert!(
            root.join(".fluentci/main").join(filename).is_file(),
            "{sdk}"
        );
        assert!(!nested.join("fluentci.toml").exists());
        let config_path = root.join("fluentci.toml");
        let original = format!(
            "# preserve this comment\n{}",
            std::fs::read_to_string(&config_path)?
        );
        std::fs::write(&config_path, &original)?;
        let config = Config::read(&config_path)?;
        assert_eq!(config.modules[0].sdk.name(), sdk);
        assert_eq!(
            config.modules[0].path.as_deref(),
            Some(Path::new(".fluentci/main"))
        );
        success(&cli(&root, &nested, &["modules", "add", "extra"])?);
        let config = Config::read(&config_path)?;
        assert_eq!(config.modules.len(), 2);
        assert_eq!(config.modules[1].sdk, Sdk::Rust);
        assert!(root.join(".fluentci/extra/src/lib.rs").is_file());
        let saved = std::fs::read_to_string(&config_path)?;
        assert!(saved.contains("# preserve this comment"));
        assert_eq!(config.steps.len(), 1);
        assert!(
            !cli(&root, &nested, &["modules", "add", "extra"])?
                .status
                .success()
        );
        assert_eq!(std::fs::read_to_string(&config_path)?, saved);
        assert!(!cli(&root, &nested, &["init"])?.status.success());
    }
    let invalid = tempfile::tempdir()?;
    assert!(
        !cli(
            invalid.path(),
            invalid.path(),
            &["init", "--sdk", "unknown"]
        )?
        .status
        .success()
    );
    assert!(!invalid.path().join("fluentci.toml").exists());
    Ok(())
}

#[test]
fn registers_downloads_and_invokes_url_modules() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    std::fs::write(root.join("fluentci.toml"), "# keep me\nsteps=[]\n")?;
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let url = format!("http://{}/plugin.wasm?version=1", listener.local_addr()?);
    let bytes = wat::parse_str("(module (func (export \"ping\") (result i32) i32.const 0))")?;
    let server = std::thread::spawn(move || -> std::io::Result<()> {
        let (mut socket, _) = listener.accept()?;
        let mut reader = BufReader::new(&mut socket);
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line)? == 0 || line == "\r\n" {
                break;
            }
        }
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Type: application/wasm\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            bytes.len()
        )?;
        socket.write_all(&bytes)?;
        Ok(())
    });
    success(&cli(
        &root,
        &root,
        &["modules", "add", "remote", "--url", &url],
    )?);
    let config = Config::read(&root.join("fluentci.toml"))?;
    assert_eq!(config.modules[0].url.as_deref(), Some(url.as_str()));
    assert!(config.modules[0].path.is_none());
    success(&cli(&root, &root, &["run", "remote", "ping"])?);
    server.join().unwrap()?;
    let output = cli(&root, &root, &["modules", "remote", "--json"])?;
    success(&output);
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&output.stdout)?["modules"][0]["functions"],
        serde_json::json!(["ping"])
    );
    assert!(!root.join(".fluentci/remote").exists());
    Ok(())
}

#[test]
fn builds_the_selected_cargo_workspace_member_with_its_library_name() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let module = root.join(".fluentci/rust-member");
    std::fs::create_dir_all(module.join("src"))?;
    std::fs::create_dir_all(root.join("apps/app/src"))?;
    std::fs::write(
        root.join(".fluentci/Cargo.toml"),
        "[workspace]\nmembers=['rust-member']\nresolver='2'",
    )?;
    std::fs::write(
        module.join("Cargo.toml"),
        "[package]\nname='different-package-name'\nversion='0.1.0'\nedition='2021'\n[lib]\nname='actual_library'\ncrate-type=['cdylib']",
    )?;
    std::fs::write(
        module.join("src/lib.rs"),
        "#[no_mangle]\npub extern \"C\" fn ping() -> i32 { 0 }",
    )?;
    std::fs::write(
        root.join("fluentci.toml"),
        "[[modules]]\nname='rust'\npath='.fluentci/rust-member'\nsdk='rust'",
    )?;
    success(&cli(
        &root,
        &root.join("apps/app/src"),
        &["run", "rust", "ping"],
    )?);
    assert!(
        root.join(".fluentci/target/wasm32-unknown-unknown/release/actual_library.wasm")
            .is_file()
    );
    let output = cli(&root, &root, &["modules", "--json"])?;
    success(&output);
    let listing: serde_json::Value = serde_json::from_slice(&output.stdout)?;
    assert!(
        listing["modules"][0]["functions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|function| function == "ping")
    );
    Ok(())
}

#[test]
fn registers_existing_modules_and_reports_missing_sources_without_registry_fallback()
-> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let nested = root.join("packages/app");
    std::fs::create_dir_all(&nested)?;
    std::fs::write(root.join("fluentci.toml"), "steps=[]")?;
    wasm(&nested.join("existing.wasm"), "ping")?;
    success(&cli(
        &root,
        &nested,
        &[
            "modules",
            "add",
            "existing",
            "--path",
            "existing.wasm",
            "--sdk",
            "elixir",
        ],
    )?);
    let config = Config::read(&root.join("fluentci.toml"))?;
    assert_eq!(
        config.modules[0].path.as_deref(),
        Some(Path::new("packages/app/existing.wasm"))
    );
    success(&cli(&root, &nested, &["run", "existing", "ping"])?);
    std::fs::remove_file(nested.join("existing.wasm"))?;
    let output = cli(&root, &nested, &["run", "existing", "ping"])?;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("does not exist"));
    Ok(())
}

#[test]
fn explicit_work_directory_controls_steps_while_configuration_stays_at_the_root()
-> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let nested = root.join("packages/app");
    std::fs::create_dir_all(&nested)?;
    std::fs::write(
        root.join("fluentci.toml"),
        "[[steps]]\nname='location'\ncommand='pwd'",
    )?;
    let output = cli(
        &root,
        &root,
        &["run", "--work-dir", "packages/app", ".", "location"],
    )?;
    success(&output);
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        nested.to_string_lossy()
    );
    let output = cli(&root, &nested, &["run", ".", "location"])?;
    success(&output);
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        root.to_string_lossy()
    );
    Ok(())
}

#[test]
fn resolves_paths_relative_to_a_legacy_config_file() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let nested = root.join("apps/app/src");
    std::fs::create_dir_all(&nested)?;
    wasm(&root.join(".fluentci/local.wasm"), "ping")?;
    std::fs::write(
        root.join(".fluentci/fluentci.toml"),
        "[[modules]]\nname='local'\npath='local.wasm'",
    )?;
    success(&cli(&root, &nested, &["run", "local", "ping"])?);
    Ok(())
}

#[test]
fn custom_sdk_builds_keep_discovery_json_clean() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().canonicalize()?;
    let source = root.join(".fluentci/custom source");
    wasm(&source.join("input.wasm"), "ping")?;
    std::fs::write(
        root.join("fluentci.toml"),
        r#"
[[modules]]
name = "custom"
path = ".fluentci/custom source"
sdk = "typescript"
artifact = "build output.wasm"
build = ["sh", "-c", "printf build-log; cp input.wasm 'build output.wasm'"]
"#,
    )?;
    let output = cli(&root, &root, &["modules", "--json"])?;
    success(&output);
    let listing: serde_json::Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(listing["modules"][0]["sdk"], "typescript");
    assert_eq!(
        listing["modules"][0]["functions"],
        serde_json::json!(["ping"])
    );
    assert!(String::from_utf8_lossy(&output.stderr).contains("build-log"));
    success(&cli(&root, &root, &["run", "custom", "ping"])?);
    Ok(())
}
