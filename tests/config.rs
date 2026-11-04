use fluentci::config::Config;

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
