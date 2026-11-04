use crate::{cli::RunArgs, config, db::Db, process, registry};
use anyhow::{Context, Result, bail};
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub async fn run(args: &RunArgs, db: &Db) -> Result<()> {
    let root = args
        .work_dir
        .as_deref()
        .unwrap_or(Path::new("."))
        .canonicalize()
        .context("Working directory does not exist")?;
    let pipeline = args.pipeline.as_deref().unwrap_or(".");
    if args.remote_exec {
        return crate::remote::run(args, &root, db).await;
    }
    if pipeline == "."
        && let Ok(key) = std::env::var("FLUENTCI_PROJECT_ID")
    {
        let mut project = db.project(&key).await?.context("Project not found")?;
        project.path = root.to_string_lossy().into();
        db.save_project(&project).await?;
        crate::executor::execute(db.clone(), project, None).await?;
        return Ok(());
    }
    if pipeline == "."
        && !args.wasm
        && !root.join(".fluentci/mod.ts").is_file()
        && let Some(path) = config::find(&root)
    {
        let actions = config::Config::read(&path)?.actions()?;
        let requested = &args.jobs;
        for name in requested {
            anyhow::ensure!(
                actions.iter().any(|a| a.name == *name),
                "Job {name:?} not found"
            );
        }
        for action in actions
            .iter()
            .filter(|a| a.enabled && (requested.is_empty() || requested.contains(&a.name)))
        {
            for command in action_commands(action)? {
                let mut action = action.clone();
                action.commands = command;
                process::run(&mut action_command(&action, &root).await?).await?;
            }
        }
        return Ok(());
    }
    let mut command = command(args, &root).await?;
    process::run(&mut command).await
}

pub async fn command(args: &RunArgs, root: &Path) -> Result<Command> {
    let pipeline = args.pipeline.as_deref().unwrap_or(".");
    let wasm = args.wasm
        || pipeline.ends_with(".wasm")
        || pipeline.ends_with("?wasm=1")
        || ["ghcr.io/", "gcr.io/", "azurecr.io/"]
            .iter()
            .any(|p| pipeline.starts_with(p));
    let mut command = if wasm || (pipeline == "." && !root.join(".fluentci/mod.ts").is_file()) {
        wasm_command(pipeline, &args.jobs, root).await?
    } else {
        let (import_map, entry) = if pipeline == "." {
            let entry = [".fluentci/src/runner.ts", ".fluentci/src/dagger/runner.ts"]
                .into_iter()
                .find(|p| root.join(p).is_file())
                .context("No TypeScript runner found; run fluentci init")?;
            (".fluentci/import_map.json".into(), entry.into())
        } else {
            let pkg = registry::resolve(pipeline).await?;
            if registry::client()
                .get(pkg.url("import_map.json"))
                .send()
                .await?
                .status()
                == reqwest::StatusCode::NOT_FOUND
            {
                return wasm_command(&format!("{}@{}", pkg.name, pkg.version), &args.jobs, root)
                    .await;
            }
            let entry = if registry::client()
                .get(pkg.url("src/dagger/runner.ts"))
                .send()
                .await?
                .status()
                == reqwest::StatusCode::NOT_FOUND
            {
                "src/runner.ts"
            } else {
                "src/dagger/runner.ts"
            };
            (pkg.url("import_map.json"), pkg.url(entry))
        };
        let mut c = if std::env::var_os("DAGGER_SESSION_PORT").is_some()
            && std::env::var_os("DAGGER_SESSION_TOKEN").is_some()
        {
            Command::new("deno")
        } else {
            let mut c = Command::new("dagger");
            c.args(["run", "deno"]);
            c
        };
        c.args(["run", "-A"]);
        if args.reload {
            c.arg("--reload");
        }
        c.arg(format!("--import-map={import_map}"))
            .arg(entry)
            .args(&args.jobs);
        c
    };
    command.current_dir(root).envs(config::environment(root)?);
    Ok(command)
}

async fn wasm_command(pipeline: &str, jobs: &[String], root: &Path) -> Result<Command> {
    let module = if pipeline == "." {
        let dir = [".fluentci/plugin", ".fluentci", "plugin", "."]
            .into_iter()
            .map(|p| root.join(p))
            .find(|p| p.join("Cargo.toml").is_file())
            .context("This directory does not contain a FluentCI plugin")?;
        process::execute("rustup", ["target", "add", "wasm32-unknown-unknown"], &dir).await?;
        process::execute(
            "cargo",
            ["build", "--release", "--target", "wasm32-unknown-unknown"],
            &dir,
        )
        .await?;
        let manifest: toml::Value =
            toml::from_str(&std::fs::read_to_string(dir.join("Cargo.toml"))?)?;
        let name = manifest["package"]["name"]
            .as_str()
            .context("Missing Cargo package name")?
            .replace('-', "_");
        // Cargo may place artifacts at a workspace root or in CARGO_TARGET_DIR.
        let output = Command::new("cargo")
            .args(["metadata", "--no-deps", "--format-version=1"])
            .current_dir(&dir)
            .output()
            .await?;
        if !output.status.success() {
            bail!("cargo metadata failed");
        }
        let metadata: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        PathBuf::from(
            metadata["target_directory"]
                .as_str()
                .context("Missing target directory")?,
        )
        .join(format!("wasm32-unknown-unknown/release/{name}.wasm"))
        .to_string_lossy()
        .into_owned()
    } else if pipeline.contains("://")
        || pipeline.ends_with(".wasm")
        || pipeline.starts_with("ghcr.io/")
        || pipeline.starts_with("gcr.io/")
        || pipeline.starts_with("azurecr.io/")
    {
        pipeline.into()
    } else {
        format!(
            "{}?wasm=1",
            registry::resolve(pipeline)
                .await?
                .url("")
                .trim_end_matches('/')
        )
    };
    let mut c = Command::new(std::env::current_exe()?);
    c.args(["__engine-call", "--module", &module, "--"])
        .args(jobs)
        .env("WASM_ENABLED", "1");
    Ok(c)
}

pub async fn action_command(action: &crate::models::Action, root: &Path) -> Result<Command> {
    let cwd = action
        .working_directory
        .as_ref()
        .map_or_else(|| root.to_path_buf(), |p| root.join(p));
    let jobs = shlex::split(&action.commands).context("Unclosed quote in action command")?;
    let mut c = if action.plugin == "shell" {
        let mut command = Command::new("bash");
        // Shell actions use the shell plugin's `bash <script>` convention.
        let script = if jobs.first().is_some_and(|s| s == "bash") {
            jobs[1..].join("\n")
        } else {
            action.commands.clone()
        };
        command
            .args(["-c", &script])
            .current_dir(&cwd)
            .envs(config::environment(root)?);
        command
    } else {
        command(
            &RunArgs {
                wasm: action.use_wasm,
                pipeline: Some(action.plugin.clone()),
                jobs,
                ..RunArgs::default()
            },
            &cwd,
        )
        .await?
    };
    for entry in action.env.iter().flatten() {
        if let Some((k, v)) = entry.split_once('=') {
            c.env(k, v);
        }
    }
    Ok(c)
}

pub async fn inspect(pipeline: Option<&str>, mode: &str) -> Result<()> {
    let pipeline = pipeline.unwrap_or(".");
    if pipeline == "."
        && mode == "list"
        && let Some(path) = config::find(Path::new("."))
    {
        for step in config::Config::read(&path)?.steps {
            println!("{}", step.name);
        }
        return Ok(());
    }
    let mut c = Command::new(if mode == "docs" { "glow" } else { "deno" });
    if mode == "docs" {
        c.arg(if pipeline == "." {
            ".fluentci/README.md".into()
        } else {
            registry::resolve(pipeline).await?.url("README.md")
        })
        .arg("-p");
    } else {
        c.args(["run", "-A"]);
        let (map, file) = if pipeline == "." {
            (
                ".fluentci/import_map.json".into(),
                ".fluentci/src/dagger/list_jobs.ts".into(),
            )
        } else {
            let p = registry::resolve(pipeline).await?;
            (p.url("import_map.json"), p.url("src/dagger/list_jobs.ts"))
        };
        c.arg(format!("--import-map={map}")).arg(file);
    }
    process::run(&mut c).await
}

/// Split the action protocol at unquoted newlines, preserving multiline arguments.
pub fn action_commands(action: &crate::models::Action) -> Result<Vec<String>> {
    if action.plugin == "shell" && !action.commands.trim_start().starts_with("bash ") {
        return Ok(vec![action.commands.clone()]);
    }
    let mut commands = Vec::new();
    let mut pending = String::new();
    for line in action.commands.lines() {
        if !pending.is_empty() {
            pending.push('\n');
        }
        pending.push_str(line);
        if shlex::split(&pending).is_some() {
            if !pending.trim().is_empty() {
                commands.push(std::mem::take(&mut pending));
            } else {
                pending.clear();
            }
        }
    }
    anyhow::ensure!(
        pending.is_empty(),
        "Unclosed quote in action {:?}",
        action.name
    );
    Ok(commands)
}
