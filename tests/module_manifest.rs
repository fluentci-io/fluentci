use anyhow::Result;
use fluentci::{
    cli::AddArgs,
    config::{self, ModuleRuntime},
    module_manifest::{self, Manifest},
    modules::{self, LocalModule},
    workspace::Workspace,
};
use fluentci_engine::components;
use std::fs;

fn math() -> Result<Vec<u8>> {
    Ok(wat::parse_str(
        r#"(component
        (core module $m (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
        (core instance $i (instantiate $m))
        (func $add (param "left" u32) (param "right" u32) (result u32) (canon lift (core func $i "add")))
        (instance (export "api") (export "add" (func $add))))"#,
    )?)
}

#[test]
fn module_metadata_is_owned_by_the_module_and_validated() -> Result<()> {
    let root = tempfile::tempdir()?;
    let source = root.path().join("tools");
    fs::create_dir_all(&source)?;
    fs::write(
        source.join("fluentci-module.toml"),
        r#"name="published-tools"
version="1.2.3"
license="MIT"
description="Shared tools"
sdk="typescript"
runtime="component"
topics=["build"]
os=["linux"]
arch=["aarch64"]
repository="https://github.com/fluentci-io/fluentci"
readme_url="https://example.com/README.md"
[dependencies]
cache="@fluentci.io/sccache@v0.1.0"
"#,
    )?;
    fs::write(
        root.path().join("fluentci.toml"),
        "[[modules]]\nname='local-alias'\npath='tools'\ndescription='workspace description'\n",
    )?;
    let config = config::Config::read(&root.path().join("fluentci.toml"))?;
    assert_eq!(config.modules[0].name, "local-alias");
    assert_eq!(config.modules[0].version.as_deref(), Some("1.2.3"));
    assert_eq!(
        config.modules[0].description.as_deref(),
        Some("Shared tools")
    );
    assert_eq!(config.modules[0].runtime, ModuleRuntime::Component);
    let workspace = Workspace::discover(&source)?;
    assert_eq!(workspace.root, source.canonicalize()?);
    assert_eq!(modules::discover(&workspace)?[0].name, "published-tools");
    for invalid in [
        "name='x'\nunknown=true",
        "name='x'\nversion='wrong'",
        "name='x'\npath='..'",
        "name='x'\n[dependencies]\nbad={path='.',url='https://example.com/a.wasm'}",
    ] {
        assert!(Manifest::parse(invalid).is_err(), "{invalid}");
    }
    Ok(())
}

#[test]
fn dependency_cycles_fail_without_building_sources() -> Result<()> {
    let root = tempfile::tempdir()?;
    fs::create_dir(root.path().join("child"))?;
    fs::write(
        root.path().join("fluentci-module.toml"),
        "name='root-module'\n[dependencies]\nchild={path='child'}\n",
    )?;
    fs::write(
        root.path().join("child/fluentci-module.toml"),
        "name='child'\n[dependencies]\nparent={path='..'}\n",
    )?;
    assert!(
        module_manifest::declarations(root.path())
            .unwrap_err()
            .to_string()
            .contains("Cyclic")
    );
    assert!(!root.path().join("fluentci.lock").exists());
    Ok(())
}

#[tokio::test]
async fn add_installs_portable_artifacts_and_preserves_manifest_comments() -> Result<()> {
    let root = tempfile::tempdir()?;
    fs::write(
        root.path().join("fluentci-module.toml"),
        "# module metadata\nname='tools'\nversion='0.1.0'\nlicense='MIT'\n\n[dependencies]\n# keep this comment\n",
    )?;
    fs::write(root.path().join("math.wasm"), math()?)?;
    let options = AddArgs {
        module: "math".into(),
        path: Some("math.wasm".into()),
        ..Default::default()
    };
    module_manifest::add(root.path(), &options).await?;
    let metadata = fs::read_to_string(root.path().join("fluentci-module.toml"))?;
    assert!(metadata.contains("# keep this comment"));
    assert!(
        Manifest::read(root.path())?
            .unwrap()
            .dependencies
            .contains_key("math")
    );
    let installed: serde_json::Value = serde_json::from_slice(&fs::read(
        root.path().join("fluentci_modules/math/module.json"),
    )?)?;
    let artifact = root
        .path()
        .join("fluentci_modules/math")
        .join(installed["artifact"].as_str().unwrap());
    assert!(components::is_component(&fs::read(artifact)?));
    assert!(fs::read_to_string(root.path().join(".gitignore"))?.contains("/fluentci_modules/"));
    assert!(root.path().join("fluentci.lock").is_file());
    fluentci::lockfile::install_at(root.path(), true, false, None).await?;
    let before = fs::read(root.path().join("fluentci-module.toml"))?;
    let invalid = AddArgs {
        module: "missing".into(),
        path: Some("missing.wasm".into()),
        ..Default::default()
    };
    assert!(module_manifest::add(root.path(), &invalid).await.is_err());
    assert_eq!(fs::read(root.path().join("fluentci-module.toml"))?, before);
    Ok(())
}

#[tokio::test]
async fn component_dependencies_link_typecheck_and_keep_frozen_locks() -> Result<()> {
    let root = tempfile::tempdir()?;
    fs::write(root.path().join("math.wasm"), math()?)?;
    let consumer = r#"(component
        (import "math" (instance $math (export "add" (func (param "left" u32) (param "right" u32) (result u32)))))
        (alias export $math "add" (func $add))
        (export "sum" (func $add)))"#;
    fs::write(root.path().join("consumer.wasm"), wat::parse_str(consumer)?)?;
    fs::write(
        root.path().join("fluentci-module.toml"),
        "name='consumer'\nruntime='component'\nartifact='consumer.wasm'\nbuild=['true']\n[dependencies]\nmath={path='math.wasm'}\n",
    )?;
    let manifest = Manifest::read(root.path())?.unwrap();
    let module = LocalModule::resolve(&root.path().join("fluentci-module.toml"), &manifest.module)?;
    assert!(module.prepare_with_lock(root.path(), true).await.is_err());
    let artifact = module.prepare_with_lock(root.path(), false).await?;
    assert_eq!(
        components::call(
            &fs::read(artifact)?,
            "sum",
            &["--left=20".into(), "--right=22".into()],
            Default::default()
        )?,
        "42"
    );
    module.prepare_with_lock(root.path(), true).await?;
    let bindings: serde_json::Value = serde_json::from_slice(&fs::read(
        root.path().join(".fluentci/dependencies/interfaces.json"),
    )?)?;
    assert_eq!(bindings[0]["alias"], "math");
    Ok(())
}
