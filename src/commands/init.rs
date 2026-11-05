use crate::{
    archive,
    config::{self, Commands, Config, Module, Package, Sdk, Step},
    registry, scaffold,
    workspace::Workspace,
};
use anyhow::{Context, Result};
use std::path::Path;

pub(super) async fn execute(
    name: Option<&str>,
    template: Option<&str>,
    standalone: bool,
    sdk: Sdk,
) -> Result<()> {
    let workspace = Workspace::current()?;
    let root = if standalone {
        std::env::current_dir()?
    } else {
        workspace.root
    };
    let name = name.unwrap_or("main");
    config::validate_module_name(name)?;
    let destination = if standalone {
        root.clone()
    } else {
        root.join(".fluentci").join(name)
    };
    anyhow::ensure!(
        config::find(&root).is_none(),
        "A FluentCI configuration already exists at {}; use fluentci modules add <name> to declare another module",
        root.display()
    );
    if !standalone {
        anyhow::ensure!(
            !destination.exists(),
            "Refusing to overwrite {}",
            destination.display()
        );
    }
    if let Some(template) = template {
        let p = registry::resolve(template).await?;
        let response = registry::client()
            .get(p.url("").trim_end_matches('/'))
            .send()
            .await?;
        let bytes = if response.status().is_success() {
            response.bytes().await?
        } else {
            let repo = p.metadata.github_url.context("No template repository")?;
            let api = repo.replace("https://github.com/", "https://api.github.com/repos/");
            registry::client()
                .get(format!("{api}/zipball/{}", p.version))
                .send()
                .await?
                .error_for_status()?
                .bytes()
                .await?
        };
        let temp = tempfile::tempdir()?;
        archive::extract(&bytes, temp.path())?;
        let mut source = temp.path().to_path_buf();
        loop {
            let entries = std::fs::read_dir(&source)?.collect::<std::io::Result<Vec<_>>>()?;
            if entries.len() == 1 && entries[0].file_type()?.is_dir() {
                source = entries[0].path();
            } else {
                break;
            }
        }
        if let Some(directory) = p.metadata.directory {
            source = source.join(directory);
        }
        if source.join("plugin").is_dir() {
            source = source.join("plugin");
        }
        copy_tree(&source, &destination)?;
    } else {
        scaffold::write(&destination, name, sdk).await?;
    }
    let path = if standalone {
        std::path::PathBuf::from(".")
    } else {
        destination.strip_prefix(&root)?.to_path_buf()
    };
    let config = Config {
        package: Some(Package {
            name: name.into(),
            version: "0.1.0".into(),
        }),
        modules: vec![Module {
            name: name.into(),
            path: Some(path),
            url: None,
            sdk,
            entry: (sdk == Sdk::Elixir).then(|| "Main".into()),
            artifact: None,
            build: None,
        }],
        steps: vec![Step {
            name: "hello".into(),
            command: Commands::One(format!("fluentci run {name} hello")),
            env: None,
            working_directory: None,
        }],
    };
    scaffold::create_file(
        &root.join("fluentci.toml"),
        &toml::to_string_pretty(&config)?,
    )
    .await?;
    println!(
        "Initialized {} module {name:?} in {}",
        sdk.name(),
        destination.display()
    );
    Ok(())
}

fn copy_tree(source: &Path, destination: &Path) -> Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            anyhow::ensure!(
                !target.exists(),
                "Refusing to overwrite {}",
                target.display()
            );
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}
