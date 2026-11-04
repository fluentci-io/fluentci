//! User-facing command orchestration.

use crate::{
    archive, auth,
    cli::{self, ModuleCommand, ProjectCommand},
    config::{self, Commands, Config, Module, Package, Sdk, Step},
    db::Db,
    models::Project,
    pipeline, process, registry, scaffold,
    workspace::Workspace,
};
use anyhow::{Context, Result, bail};
use std::path::Path;
use tokio::process::Command;

pub async fn dispatch(cli: cli::Cli) -> Result<()> {
    // Worker modes must run before opening SQLite or starting any services.
    match &cli.command {
        Some(cli::Command::EngineCall { module, commands }) => {
            let module = module.clone();
            let (function, arguments) = commands
                .split_first()
                .context("A plugin export name is required")?;
            let command = format!("{function} {}", arguments.join(" "));
            return tokio::task::spawn_blocking(move || {
                fluentci_engine::cmd::call::call(&module, &command)
            })
            .await?;
        }
        Some(cli::Command::ProviderWorker { request }) => {
            return fluentci_ext::worker::run(request);
        }
        _ => {}
    }
    let db = Db::open(&cli.database).await?;
    if cli.check_update
        && let Err(error) = registry::check_update(&db).await
    {
        tracing::debug!(%error,"Update check failed");
    }
    use cli::Command::*;

    match cli.command {
        None => pipeline::run(&cli.run, &db).await,
        Some(Run(args)) => pipeline::run(&args, &db).await,
        Some(Init {
            name,
            template,
            standalone,
            wasm: _,
            sdk,
        }) => init(name.as_deref(), template.as_deref(), standalone, sdk).await,
        Some(Search { query, limit }) => registry::search(&query, limit).await,
        Some(Modules {
            command:
                Some(ModuleCommand::Add {
                    name,
                    sdk,
                    path,
                    url,
                    entry,
                }),
            ..
        }) => {
            crate::modules::add(
                &name,
                sdk,
                path.as_deref(),
                url.as_deref(),
                entry.as_deref(),
            )
            .await
        }
        Some(Modules {
            command: None,
            name,
            json,
        }) => crate::modules::inspect(name.as_deref(), json).await,
        Some(Ls { pipeline }) => pipeline::inspect(pipeline.as_deref(), "list").await,
        Some(Docs { pipeline }) => pipeline::inspect(pipeline.as_deref(), "docs").await,
        Some(Doctor) => doctor().await,
        Some(Env) => {
            for (key, value) in config::environment(&Workspace::current()?.root)? {
                println!("{key} = {value}");
            }
            Ok(())
        }
        Some(Login) => auth::login(&db).await,
        Some(Whoami) => auth::whoami(&db).await,
        Some(Publish { wasm }) => publish(&db, wasm).await,
        Some(Agent { command: Some(_) }) => crate::remote::list_agents(&db).await,
        Some(Agent { command: None }) => crate::remote::agent(&db).await,
        Some(Repl { debug, pipelines }) => repl(debug, &pipelines).await,
        Some(Server { port }) => crate::server::serve(db, port, false).await,
        Some(Studio { port }) => {
            let path = Workspace::current()?.root.to_string_lossy().into_owned();
            if db.project(&path).await?.is_none() {
                let p = crate::models::Project::new(path);
                db.save_project(&p).await?;
                if let Some(path) = config::find(Path::new(&p.path)) {
                    db.save_actions(&p.id, &config::Config::read(&path)?.actions()?)
                        .await?;
                }
            }
            crate::server::serve(db, port, true).await
        }
        Some(Project { command }) => project(&db, command).await,
        Some(Up) => crate::services::control("up", None).await,
        Some(Down) => crate::services::control("down", None).await,
        Some(Ps) => crate::services::control("ps", None).await,
        Some(Status { service }) => crate::services::control("status", Some(&service)).await,
        Some(Start { service } | Restart { service }) => {
            crate::services::control("restart", Some(&service)).await
        }
        Some(Stop { service }) => crate::services::control("stop", Some(&service)).await,
        Some(Echo { service }) => crate::services::control("echo", Some(&service)).await,
        Some(Community) => {
            open::that("https://discord.gg/V4U6dPskKc")?;
            Ok(())
        }
        Some(Upgrade) => upgrade().await,
        Some(EngineCall { .. } | ProviderWorker { .. }) => {
            unreachable!("Worker modes handled before opening database")
        }
    }
}

async fn project(db: &Db, command: ProjectCommand) -> Result<()> {
    match command {
        ProjectCommand::Create => {
            let p = Project::new("empty".into());
            db.save_project(&p).await?;
            println!(
                "Project {} created. Run FLUENTCI_PROJECT_ID={} fluentci run . to finish setup",
                p.name, p.name
            );
        }
        ProjectCommand::List => {
            println!("NAME\tPATH\tCREATED");
            for p in db.projects().await? {
                println!("{}\t{}\t{}", p.name, p.path, p.created_at);
            }
        }
        ProjectCommand::Show { name } => {
            let p = db.project(&name).await?.context("Project not found")?;
            println!("{}", serde_json::to_string_pretty(&p)?);
        }
        ProjectCommand::Export {
            name,
            azure,
            gitlab,
            circleci,
            aws,
            ..
        } => {
            let key = name.unwrap_or(Workspace::current()?.root.to_string_lossy().into());
            let p = db.project(&key).await?.context("Project not found")?;
            let provider = if azure {
                "azure"
            } else if gitlab {
                "gitlab"
            } else if circleci {
                "circleci"
            } else if aws {
                "aws"
            } else {
                "github"
            };
            print!(
                "{}",
                crate::export::generate(provider, &db.actions(&p.id).await?)?
            );
        }
    }
    Ok(())
}

async fn init(
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

async fn doctor() -> Result<()> {
    println!(
        "FluentCI {} (embedded engine, Studio, SQLite)",
        env!("CARGO_PKG_VERSION")
    );
    let mut missing = Vec::new();
    for (name, args) in [
        ("deno", vec!["--version"]),
        ("dagger", vec!["version"]),
        ("docker", vec!["--version"]),
        ("glow", vec!["--version"]),
    ] {
        match Command::new(name).args(args).output().await {
            Ok(output) if output.status.success() => println!(
                "[✓] {name}: {}",
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or_default()
            ),
            _ => {
                println!("[✗] {name}: not available");
                missing.push(name);
            }
        }
    }
    anyhow::ensure!(
        missing.is_empty(),
        "Missing optional pipeline tools: {}",
        missing.join(", ")
    );
    Ok(())
}

async fn publish(db: &Db, wasm: bool) -> Result<()> {
    let token = auth::token(db).await?;
    let mut request = registry::client()
        .post("https://whole-badger-28.deno.dev")
        .bearer_auth(token);
    if wasm {
        let dir = if Path::new("plugin/Cargo.toml").is_file() {
            Path::new("plugin")
        } else {
            Path::new(".")
        };
        process::execute("rustup", ["target", "add", "wasm32-unknown-unknown"], dir).await?;
        process::execute(
            "cargo",
            ["build", "--release", "--target", "wasm32-unknown-unknown"],
            dir,
        )
        .await?;
        let manifest: toml::Value =
            toml::from_str(&std::fs::read_to_string(dir.join("Cargo.toml"))?)?;
        let name = manifest["package"]["name"]
            .as_str()
            .context("Missing package name")?;
        let version = manifest["package"]["version"]
            .as_str()
            .context("Missing package version")?;
        let output = Command::new("cargo")
            .args(["metadata", "--no-deps", "--format-version=1"])
            .current_dir(dir)
            .output()
            .await?;
        anyhow::ensure!(output.status.success(), "cargo metadata failed");
        let metadata: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let target = Path::new(
            metadata["target_directory"]
                .as_str()
                .context("Missing target directory")?,
        )
        .join(format!(
            "wasm32-unknown-unknown/release/{}.wasm",
            name.replace('-', "_")
        ));
        request = request
            .header("Content-Type", "application/wasm")
            .header("Name", name)
            .header("Version", version)
            .body(tokio::fs::read(target).await?);
    } else {
        anyhow::ensure!(
            Path::new("mod.ts").is_file() && Path::new("dagger.json").is_file(),
            "A TypeScript package must contain mod.ts and dagger.json"
        );
        let root = std::env::current_dir()?;
        let bytes = tokio::task::spawn_blocking(move || archive::bundle(&root)).await??;
        request = request
            .header("Content-Type", "application/zip")
            .body(bytes);
    }
    request.send().await?.error_for_status()?;
    println!("Package published successfully");
    Ok(())
}

async fn repl(debug: bool, pipelines: &[String]) -> Result<()> {
    let mut source = String::new();
    if Path::new(".fluentci/mod.ts").is_file() {
        source.push_str("import * as pipeline from './.fluentci/mod.ts';\n");
    }
    for (index, pipeline) in pipelines.iter().enumerate() {
        let p = registry::resolve(pipeline).await?;
        source.push_str(&format!(
            "import * as pipeline{index} from {};\n",
            serde_json::to_string(&p.url("mod.ts"))?
        ));
    }
    let mut c = Command::new("dagger");
    c.args(["run", "deno", "repl", "-A", "--eval", &source]);
    if debug {
        c.env("DAGGER_LOG_LEVEL", "debug");
    }
    process::run(&mut c).await
}

async fn upgrade() -> Result<()> {
    let data: serde_json::Value = registry::client()
        .get("https://api.github.com/repos/fluentci-io/fluentci/releases/latest")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let version = data["tag_name"]
        .as_str()
        .context("Release has no version")?;
    if version.trim_start_matches('v') == env!("CARGO_PKG_VERSION") {
        println!("Already on the latest release");
        return Ok(());
    }
    let os = match std::env::consts::OS {
        "macos" => "apple-darwin",
        "linux" => "unknown-linux-gnu",
        _ => bail!("Upgrade is not supported on this platform"),
    };
    let target = format!("{}-{os}", std::env::consts::ARCH);
    let asset_name = format!("fluentci_{version}_{target}.tar.gz");
    let asset = data["assets"]
        .as_array()
        .context("Release has no assets")?
        .iter()
        .find(|a| a["name"] == asset_name)
        .context("No binary available for this platform")?;
    let url = asset["browser_download_url"]
        .as_str()
        .context("Missing asset URL")?;
    let bytes = registry::client()
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    let temp = tempfile::tempdir()?;
    let archive = temp.path().join("fluentci.tar.gz");
    tokio::fs::write(&archive, bytes).await?;
    process::execute("tar", ["xzf", &archive.to_string_lossy()], temp.path()).await?;
    let current = std::env::current_exe()?;
    let staged = current.with_extension("new");
    tokio::fs::copy(temp.path().join("fluentci"), &staged).await?;
    tokio::fs::rename(staged, current).await?;
    println!("Upgraded to {version}");
    Ok(())
}
