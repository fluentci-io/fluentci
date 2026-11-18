use fluentci::config::{Config, ModuleRuntime};
use fluentci_engine::cmd::metadata::{InputFormat, inspect};

#[test]
fn omitted_runtime_preserves_existing_extism_modules() -> anyhow::Result<()> {
    let config = Config::parse("[[modules]]\nname='legacy'\npath='.'\nsdk='rust'\n")?;
    assert_eq!(config.modules[0].runtime, ModuleRuntime::Extism);
    let saved = toml::to_string(&config)?;
    assert_eq!(
        Config::parse(&saved)?.modules[0].runtime,
        ModuleRuntime::Extism
    );
    Ok(())
}

#[test]
fn repository_ci_modules_use_native_components() {
    let config = Config::parse(include_str!("../fluentci.toml")).unwrap();
    assert!(!config.modules.is_empty());
    for module in config.modules {
        assert_eq!(module.runtime, fluentci::config::ModuleRuntime::Component);
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

#[test]
fn official_registry_names_can_omit_the_handle() -> anyhow::Result<()> {
    for declaration in [
        "name='sccache'",
        "name='sccache@v1.2.3'",
        "name='cache'\npackage='sccache@latest'",
        "name='cache'\npackage='sccache@v1.2.3'",
    ] {
        let config = Config::parse(&format!("[[modules]]\n{declaration}"))?;
        let module = &config.modules[0];
        assert!(module.registry_package().is_some());
        let resolved = fluentci::modules::LocalModule::resolve(
            std::path::Path::new("/tmp/fluentci.toml"),
            module,
        )?;
        assert!(matches!(
            resolved.source,
            fluentci::modules::ModuleSource::Registry(_)
        ));
    }
    for invalid in [
        "name='shell'",
        "name='invalid'\npackage='cache@not-semver'",
        "name='invalid'\npackage='owner/cache'",
    ] {
        assert!(Config::parse(&format!("[[modules]]\n{invalid}")).is_err());
    }
    Ok(())
}

#[test]
#[ignore = "requires precompiled repository CI components"]
fn compiled_ci_components_have_typed_documented_signatures() -> anyhow::Result<()> {
    let config = Config::parse(include_str!("../fluentci.toml"))?;
    for module in config.modules {
        // Published modules have independent contracts and no local build path.
        if module.registry_package().is_some() {
            continue;
        }
        let source = module.path.as_deref().ok_or_else(|| {
            anyhow::anyhow!("Local CI module {:?} has no source path", module.name)
        })?;
        let path = std::path::Path::new(source).join("dist/plugin.wasm");
        let bytes = std::fs::read(path)?;
        assert!(fluentci_engine::components::is_component(&bytes));
        // inspect verifies embedded docs/types against the component's real WIT ABI.
        let functions = inspect(&bytes, None)?;
        assert!(!functions.is_empty());
        let cache_contract: Option<serde_json::Value> = if module.name == "cache" {
            let schema = std::fs::read(std::path::Path::new(source).join("schema.json"))?;
            Some(serde_json::from_slice(&schema)?)
        } else {
            None
        };
        if let Some(schema) = &cache_contract {
            assert_eq!(
                functions.len(),
                schema["exports"].as_object().unwrap().len()
            );
        }
        for function in functions {
            assert_eq!(function.input_format, InputFormat::Wit);
            let declared = cache_contract.as_ref().map(|schema| {
                schema["exports"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .find(|(name, _)| name.eq_ignore_ascii_case(&function.name.replace('-', "")))
                    .expect("cache export must have a declared contract")
                    .1
            });
            let expected_return = if declared.is_some() {
                format!("{}-result", function.name)
            } else {
                "unit".to_owned()
            };
            assert_eq!(
                function.return_type.as_deref(),
                Some(expected_return.as_str())
            );
            assert!(
                function
                    .description
                    .as_deref()
                    .is_some_and(|text| !text.is_empty())
            );
            let arguments = function.args.unwrap();
            if let Some(contract) = declared {
                assert_eq!(
                    arguments.len(),
                    contract["input"]["properties"].as_object().unwrap().len()
                );
            }
            for argument in arguments {
                if let Some(contract) = declared {
                    let (name, property) = contract["input"]["properties"]
                        .as_object()
                        .unwrap()
                        .iter()
                        .find(|(name, _)| {
                            name.eq_ignore_ascii_case(&argument.name.replace('-', ""))
                        })
                        .expect("cache argument must have a declared contract");
                    assert_eq!(argument.type_name, property["type"].as_str().unwrap());
                    assert_eq!(
                        argument.required,
                        contract["input"]["required"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|required| required.as_str() == Some(name.as_str()))
                    );
                } else {
                    assert_eq!(argument.type_name, "string");
                    assert!(argument.required);
                }
                assert!(
                    argument
                        .description
                        .as_deref()
                        .is_some_and(|text| !text.is_empty())
                );
            }
        }
    }
    Ok(())
}

#[test]
fn registry_handles_can_omit_the_at_prefix() -> anyhow::Result<()> {
    for definition in [
        "[[modules]]\nname='fluentci.io/setup-gh'\n",
        "[[modules]]\nname='gh'\npackage='fluentci.io/setup-gh@v0.2.0'\n",
    ] {
        let config = Config::parse(definition)?;
        assert!(
            config.modules[0]
                .registry_package()
                .unwrap()
                .contains("fluentci.io/setup-gh")
        );
    }
    Ok(())
}
