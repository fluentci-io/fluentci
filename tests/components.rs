use anyhow::{Context, Result};
use fluentci::{
    config::{ModuleRuntime, Sdk},
    plugin_metadata, scaffold,
};
use fluentci_engine::components;
use std::process::Command;

#[test]
#[ignore = "requires the wasm32-wasip2 target and the component guest toolchain"]
fn rust_component_starter_generates_wit_and_runs_without_extism() -> Result<()> {
    let directory = tempfile::tempdir()?;
    tokio::runtime::Runtime::new()?.block_on(scaffold::write_with_runtime(
        directory.path(),
        "component-fixture",
        Sdk::Rust,
        ModuleRuntime::Component,
    ))?;
    let manifest = std::fs::read_to_string(directory.path().join("Cargo.toml"))?;
    assert!(!manifest.contains("extism"));
    for args in [
        vec!["generate-lockfile"],
        vec![
            "build",
            "--release",
            "--locked",
            "--target",
            "wasm32-wasip2",
        ],
    ] {
        let output = Command::new("cargo")
            .args(args)
            .env("CARGO_TARGET_DIR", directory.path().join("target"))
            .current_dir(directory.path())
            .output()?;
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let bytes = std::fs::read(
        directory
            .path()
            .join("target/wasm32-wasip2/release/component_fixture.wasm"),
    )?;
    assert!(components::is_component(&bytes));
    let functions = plugin_metadata::inspect(&bytes, None)?;
    let hello = functions
        .iter()
        .find(|function| function.name == "hello")
        .context("Missing hello export")?;
    assert_eq!(hello.input_format, plugin_metadata::InputFormat::Wit);
    assert_eq!(hello.args.as_ref().unwrap()[0].name, "name");
    assert_eq!(hello.return_type.as_deref(), Some("string"));
    assert_eq!(
        hello.description.as_deref(),
        Some("Greet someone from a native Wasm component.")
    );
    let annotated = plugin_metadata::embed(&bytes, functions)?;
    assert_eq!(
        components::call(
            &annotated,
            "hello",
            &["--name".into(), "Tsiry".into()],
            Default::default()
        )?,
        "Hello, Tsiry!"
    );
    Ok(())
}

#[test]
#[ignore = "requires the selected SDK component compiler and network access for dependencies"]
fn language_component_starter_generates_wit_and_runs_without_extism() -> Result<()> {
    let language = std::env::var("FLUENTCI_COMPONENT_SDK")
        .context("Set FLUENTCI_COMPONENT_SDK to the language to test")?;
    let sdk = match language.as_str() {
        "typescript" => Sdk::Typescript,
        "purescript" => Sdk::Purescript,
        "gleam" => Sdk::Gleam,
        "rescript" => Sdk::Rescript,
        "clojurescript" => Sdk::Clojurescript,
        "python" => Sdk::Python,
        "elixir" => Sdk::Elixir,
        _ => anyhow::bail!("Unknown SDK {language}"),
    };
    let directory = tempfile::tempdir()?;
    tokio::runtime::Runtime::new()?.block_on(scaffold::write_with_runtime(
        directory.path(),
        "component-fixture",
        sdk,
        ModuleRuntime::Component,
    ))?;
    let commands = match sdk {
        Sdk::Python => vec![("uv", vec!["run", "build.py"])],
        Sdk::Elixir => vec![
            ("mix", vec!["deps.get"]),
            (
                "mix",
                vec![
                    "fluentci.plugin.build",
                    "Main",
                    "--runtime",
                    "component",
                    "--output",
                    "dist/plugin.wasm",
                ],
            ),
        ],
        _ => vec![("npm", vec!["install"]), ("npm", vec!["run", "build"])],
    };
    if std::env::var_os("FLUENTCI_COMPONENT_PREBUILT").is_none() {
        for (program, args) in commands {
            let output = Command::new(program)
                .args(args)
                .current_dir(directory.path())
                .output()?;
            assert!(
                output.status.success(),
                "{language}: {}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
    let artifact = std::env::var_os("FLUENTCI_COMPONENT_PREBUILT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| directory.path().join("dist/plugin.wasm"));
    let bytes = std::fs::read(artifact)?;
    assert!(
        components::is_component(&bytes),
        "{language} produced a core module instead of a component"
    );
    let functions = plugin_metadata::inspect(&bytes, None)?;
    let hello = functions
        .iter()
        .find(|function| function.name == "hello")
        .context("Missing hello component export")?;
    assert_eq!(hello.input_format, plugin_metadata::InputFormat::Wit);
    assert_eq!(
        hello.return_type.as_deref(),
        Some(if sdk == Sdk::Elixir {
            "result<string, string>"
        } else {
            "string"
        })
    );
    let args = if sdk == Sdk::Elixir {
        vec![]
    } else {
        vec!["--name".into(), "Tsiry".into()]
    };
    let annotated = plugin_metadata::embed(&bytes, functions.clone())?;
    assert_eq!(
        serde_json::to_value(plugin_metadata::inspect(&annotated, None)?)?,
        serde_json::to_value(&functions)?
    );
    assert_eq!(
        components::call(&annotated, "hello", &args, Default::default())?,
        if sdk == Sdk::Elixir {
            "Hello from FluentCI"
        } else {
            "Hello, Tsiry!"
        }
    );
    if sdk == Sdk::Elixir {
        assert_eq!(
            components::call(
                &annotated,
                "echo",
                &["--name".into(), "Tsiry".into()],
                Default::default()
            )?,
            "Tsiry"
        );
    }
    Ok(())
}

#[test]
fn component_annotations_preserve_nested_core_sections() -> Result<()> {
    let bytes = wat::parse_str(
        r#"(component (core module (@custom "fluentci:metadata" "nested metadata")))"#,
    )?;
    let annotated = plugin_metadata::embed(&bytes, vec![])?;
    wasmparser::Validator::new().validate_all(&annotated)?;
    assert!(
        annotated
            .windows(b"nested metadata".len())
            .any(|window| window == b"nested metadata")
    );
    assert_eq!(plugin_metadata::embed(&annotated, vec![])?, annotated);
    Ok(())
}
