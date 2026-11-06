use fluentci::config::Config;

#[test]
fn repository_ci_modules_remain_compatible_with_the_bootstrap_cli() {
    // The published 2026.11.04 bootstrap rejects unknown module fields. The
    // private CI modules must remain readable before the new CLI is built.
    let manifest = include_str!("../fluentci.toml");
    let config = Config::parse(manifest).unwrap();
    assert!(!config.modules.is_empty());
    let document: toml::Value = toml::from_str(manifest).unwrap();
    let supported = ["name", "path", "url", "sdk", "entry", "artifact", "build"];
    for module in document["modules"].as_array().unwrap() {
        for key in module.as_table().unwrap().keys() {
            assert!(
                supported.contains(&key.as_str()),
                "CI module field {key:?} is unsupported by the pinned bootstrap CLI"
            );
        }
    }
}

#[test]
fn parses_every_existing_fixture() {
    for file in std::fs::read_dir("fixtures").unwrap() {
        let path = file.unwrap().path();
        if path.extension().is_some_and(|e| e == "toml") {
            let config =
                Config::read(&path).unwrap_or_else(|e| panic!("{}: {e:#}", path.display()));
            let actions = config.actions().unwrap();
            assert!(!actions.is_empty(), "{}", path.display());
            assert!(actions.iter().all(|a| a.enabled && a.use_wasm));
        }
    }
}

#[test]
fn preserves_quoted_arguments_and_environment_values() {
    let config = Config::parse(
        r#"
[[steps]]
name = "test"
command = "fluentci run --wasm bun run test --filter 'hello world'"
env = ["TOKEN=a=b", "CI=true"]
working_directory = "client"
"#,
    )
    .unwrap();
    let actions = config.actions().unwrap();
    assert_eq!(actions[0].plugin, "bun");
    assert_eq!(
        shlex::split(&actions[0].commands).unwrap(),
        ["run", "test", "--filter", "hello world"]
    );
    assert_eq!(actions[0].env.as_ref().unwrap()[0], "TOKEN=a=b");
    assert_eq!(actions[0].working_directory.as_deref(), Some("client"));
}

#[test]
fn rejects_empty_commands() {
    assert!(
        Config::parse("[[steps]]\nname='empty'\ncommand=[]")
            .unwrap()
            .actions()
            .is_err()
    );
}

#[test]
fn parses_module_sdks_and_rejects_invalid_declarations() {
    let config = Config::parse(
        r#"
[[modules]]
name = "main"
path = ".fluentci/main"
[[modules]]
name = "backend"
path = ".fluentci/backend"
sdk = "elixir"
entry = "Backend"
[[modules]]
name = "remote"
url = "https://example.com/plugin.wasm?version=1"
sdk = "typescript"
"#,
    )
    .unwrap();
    assert_eq!(config.modules[0].sdk, fluentci::config::Sdk::Rust);
    assert_eq!(config.modules[1].sdk, fluentci::config::Sdk::Elixir);
    assert_eq!(
        config.modules[2].url.as_deref(),
        Some("https://example.com/plugin.wasm?version=1")
    );
    for declaration in [
        "[[modules]]\nname='duplicate'\npath='one'\n[[modules]]\nname='duplicate'\npath='two'",
        "[[modules]]\nname='empty'\npath=''",
        "[[modules]]\nname='invalid'\npath='one'\nsdk='unknown'",
        "[[modules]]\nname='invalid'\npath='one'\nurl='https://example.com/plugin.wasm'",
        "[[modules]]\nname='invalid'\nurl='file:///tmp/plugin.wasm'",
        "[[modules]]\nname='invalid'\nurl='https://example.com/plugin.js'",
        "[[modules]]\nname='invalid'\npath='one'\nbuild=[]",
        "[[modules]]\nname='invalid'\npath='one'\nsdk='elixir'",
    ] {
        assert!(Config::parse(declaration).is_err(), "{declaration}");
    }
}

#[test]
fn registry_module_aliases_and_repository_metadata_are_supported() -> anyhow::Result<()> {
    let config = fluentci::config::Config::parse(
        r#"
[[modules]]
name = "sccache"
package = "@tsiry-sandratraina.com/sccache@v0.1.0"
repository = "https://github.com/fluentci-io/fluentci"
[[modules]]
name = "@tsiry-sandratraina.com/sccache"
"#,
    )?;
    for module in &config.modules {
        let resolved = fluentci::modules::LocalModule::resolve(
            std::path::Path::new("/tmp/fluentci.toml"),
            module,
        )?;
        assert!(matches!(
            resolved.source,
            fluentci::modules::ModuleSource::Registry(_)
        ));
    }
    for source in [
        "name='test'\npackage='@handle/module'\npath='.'",
        "name='test'\npackage='@handle/module'\nurl='https://example.com/mod.wasm'",
        "name='test'\npackage='@handle/module'\nbuild=['sh']",
        "name='test'\npackage='unscoped'",
        "name='test'\npath='.'\nrepository='https://user:password@example.com/repo'",
    ] {
        assert!(fluentci::config::Config::parse(&format!("[[modules]]\n{source}")).is_err());
    }
    Ok(())
}

#[test]
fn module_logo_is_optional_and_requires_an_http_picture_url() -> anyhow::Result<()> {
    let config = fluentci::config::Config::parse(
        "[[modules]]\nname='hello'\npath='.'\nlogo='https://cdn.example/hello.png'",
    )?;
    assert_eq!(
        config.modules[0].logo.as_deref(),
        Some("https://cdn.example/hello.png")
    );
    for invalid in [
        "file:///tmp/logo.png",
        "data:image/png;base64,abc",
        "https://user:secret@example.com/logo.png",
    ] {
        assert!(fluentci::config::validate_logo(invalid).is_err());
    }
    Ok(())
}

#[test]
fn module_classification_and_readme_metadata_are_optional_and_validated() -> anyhow::Result<()> {
    let config = fluentci::config::Config::parse(
        r#"
[[modules]]
name = "cache"
path = "."
topics = ["cache", "rust"]
os = ["linux", "macos", "freebsd"]
arch = ["x86_64", "aarch64"]
readme_url = "https://example.com/README.md"
"#,
    )?;
    let module = &config.modules[0];
    assert_eq!(module.topics, ["cache", "rust"]);
    assert_eq!(module.os, ["linux", "macos", "freebsd"]);
    assert_eq!(module.arch, ["x86_64", "aarch64"]);
    assert_eq!(
        module.readme_url.as_deref(),
        Some("https://example.com/README.md")
    );
    for invalid in [
        "topics=['cache','cache']",
        "topics=['Invalid']",
        "os=['linux/linux']",
        "arch=['ARM64']",
        "readme_url='file:///tmp/README.md'",
        "readme_url='https://user:secret@example.com/README.md'",
    ] {
        assert!(
            fluentci::config::Config::parse(&format!(
                "[[modules]]\nname='cache'\npath='.'\n{invalid}"
            ))
            .is_err()
        );
    }
    Ok(())
}
