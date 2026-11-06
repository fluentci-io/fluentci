use crate::{cli::RunArgs, config, db::Db, modules, process, registry, workspace::Workspace};
use anyhow::{Context, Result};
use std::path::Path;
use tokio::process::Command;

pub async fn run(args: &RunArgs, db: &Db) -> Result<()> {
    let start = args
        .work_dir
        .as_deref()
        .unwrap_or(Path::new("."))
        .canonicalize()
        .context("Working directory does not exist")?;
    let workspace = Workspace::discover(&start)?;
    let root = &workspace.root;
    let working_directory = if args.work_dir.is_some() {
        &start
    } else {
        root
    };
    let pipeline = args.pipeline.as_deref().unwrap_or(".");
    let workflow_id = args.workflow.as_deref().or_else(|| {
        (pipeline == "." && !args.wasm && root.join(".fluentci/workflows").is_dir())
            .then_some(crate::workflows::DEFAULT)
    });
    let workflow_id = match workflow_id {
        Some(key) if args.workflow.is_none() => {
            crate::workflows::file_definition(root, key)?.map(|_| key)
        }
        other => other,
    };
    if let Some(workflow_id) = workflow_id {
        anyhow::ensure!(
            pipeline == "." && args.jobs.is_empty(),
            "Use --workflow without module names or function arguments"
        );
        let path = root.to_string_lossy().into_owned();
        let mut project = if let Ok(key) = std::env::var("FLUENTCI_PROJECT_ID") {
            db.project(&key).await?.context("Project not found")?
        } else {
            db.project(&path)
                .await?
                .unwrap_or_else(|| crate::models::Project::new(path.clone()))
        };
        project.path = path;
        db.save_project(&project).await?;
        let run = crate::executor::prepare_workflow(db, &project, workflow_id, None).await?;
        crate::executor::execute_prepared_with_options(
            db.clone(),
            project,
            run,
            None,
            args.frozen_lockfile,
        )
        .await?;
        return Ok(());
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
        && let Some(path) = config::find(root)
    {
        let config = config::Config::read(&path)?;
        let actions = config.actions()?;
        anyhow::ensure!(
            !actions.is_empty(),
            "No pipeline steps configured. Run a declared module with fluentci run <module> <function>"
        );
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
                process::run(
                    &mut action_command_at(&action, root, working_directory, args.frozen_lockfile)
                        .await?,
                )
                .await?;
            }
        }
        return Ok(());
    }
    let mut command = command_with_config(args, working_directory, root).await?;
    process::run(&mut command).await
}

pub async fn command(args: &RunArgs, root: &Path) -> Result<Command> {
    command_with_config(args, root, root).await
}

async fn command_with_config(args: &RunArgs, root: &Path, config_root: &Path) -> Result<Command> {
    let pipeline = args.pipeline.as_deref().unwrap_or(".");
    let declared = if pipeline == "." && args.wasm {
        let workspace = Workspace::discover(config_root)?;
        if let Some(path) = &workspace.config {
            let config = config::Config::read(path)?;
            anyhow::ensure!(
                config.modules.len() <= 1,
                "Multiple modules are declared; select one with fluentci run <module> <function>"
            );
            config
                .modules
                .first()
                .map(|module| modules::LocalModule::resolve(path, module))
                .transpose()?
        } else {
            None
        }
    } else {
        modules::resolve(config_root, pipeline)?
    };
    if let Some(module) = declared {
        anyhow::ensure!(
            !args.jobs.is_empty(),
            "Specify a function: fluentci run {} <function> [args...]; use fluentci modules to list exports",
            module.name
        );
        let wasm = module
            .prepare_with_lock(config_root, args.frozen_lockfile)
            .await?;
        let mut command = engine_command(&wasm.to_string_lossy(), &args.jobs)?;
        command
            .current_dir(root)
            .envs(config::environment(config_root)?);
        return Ok(command);
    }
    let wasm = args.wasm
        || pipeline.starts_with("http://")
        || pipeline.starts_with("https://")
        || pipeline.ends_with(".wasm")
        || pipeline.ends_with("?wasm=1")
        || ["ghcr.io/", "gcr.io/", "azurecr.io/"]
            .iter()
            .any(|p| pipeline.starts_with(p));
    let mut command = if wasm || (pipeline == "." && !root.join(".fluentci/mod.ts").is_file()) {
        wasm_command(
            pipeline,
            &args.jobs,
            root,
            config_root,
            args.frozen_lockfile,
        )
        .await?
    } else {
        let (import_map, entry) = if pipeline == "." {
            let entry = [".fluentci/src/runner.ts", ".fluentci/src/dagger/runner.ts"]
                .into_iter()
                .find(|p| root.join(p).is_file())
                .context("No TypeScript runner found; run fluentci init")?;
            (".fluentci/import_map.json".into(), entry.into())
        } else {
            let pkg = crate::lockfile::resolve(config_root, pipeline, args.frozen_lockfile).await?;
            if pkg.metadata.url.is_some() {
                let artifact = registry::wasm_artifact(&pkg).await?;
                let mut command = engine_command(&artifact.to_string_lossy(), &args.jobs)?;
                command
                    .current_dir(root)
                    .envs(config::environment(config_root)?);
                return Ok(command);
            }
            if registry::client()
                .get(pkg.url("import_map.json"))
                .send()
                .await?
                .status()
                == reqwest::StatusCode::NOT_FOUND
            {
                return wasm_command(
                    &format!("{}@{}", pkg.name, pkg.version),
                    &args.jobs,
                    root,
                    config_root,
                    args.frozen_lockfile,
                )
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

async fn wasm_command(
    pipeline: &str,
    jobs: &[String],
    root: &Path,
    config_root: &Path,
    frozen: bool,
) -> Result<Command> {
    let module = if pipeline == "." {
        let dir = [".fluentci/plugin", ".fluentci", "plugin", "."]
            .into_iter()
            .map(|p| root.join(p))
            .find(|p| p.join("Cargo.toml").is_file())
            .context("This directory does not contain a FluentCI plugin")?;
        modules::build(&dir.join("Cargo.toml"))
            .await?
            .to_string_lossy()
            .into_owned()
    } else if pipeline.starts_with("https://") || pipeline.starts_with("http://") {
        let url = config::validate_module_url(pipeline)?;
        modules::download(&url)
            .await?
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
        let package = crate::lockfile::resolve(config_root, pipeline, frozen).await?;
        if package.metadata.url.is_some() {
            registry::wasm_artifact(&package)
                .await?
                .to_string_lossy()
                .into_owned()
        } else {
            format!("{}?wasm=1", package.url("").trim_end_matches('/'))
        }
    };
    engine_command(&module, jobs)
}

fn engine_command(module: &str, jobs: &[String]) -> Result<Command> {
    let mut command = Command::new(std::env::current_exe()?);
    command
        .args(["__engine-call", "--module", module, "--"])
        .args(jobs)
        .env("WASM_ENABLED", "1");
    Ok(command)
}

pub async fn action_command(action: &crate::models::Action, root: &Path) -> Result<Command> {
    action_command_at(action, root, root, false).await
}

pub async fn action_command_with_options(
    action: &crate::models::Action,
    root: &Path,
    frozen_lockfile: bool,
) -> Result<Command> {
    action_command_at(action, root, root, frozen_lockfile).await
}

async fn action_command_at(
    action: &crate::models::Action,
    root: &Path,
    default_directory: &Path,
    frozen_lockfile: bool,
) -> Result<Command> {
    let cwd = action
        .working_directory
        .as_ref()
        .map_or_else(|| default_directory.to_path_buf(), |path| root.join(path));
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
        command_with_config(
            &RunArgs {
                frozen_lockfile,
                wasm: action.use_wasm,
                pipeline: Some(action.plugin.clone()),
                jobs,
                ..RunArgs::default()
            },
            &cwd,
            root,
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

async fn render_readme(readme: Option<std::path::PathBuf>) -> Result<()> {
    if let Some(readme) = readme {
        process::run(Command::new("glow").arg(readme).arg("-p")).await
    } else {
        println!("No README.md is available for this module.");
        Ok(())
    }
}

fn source_readme(source: &Path) -> Result<Option<std::path::PathBuf>> {
    let directory = if source.is_dir() {
        source
    } else {
        source.parent().context("Module has no source directory")?
    };
    let readme = directory.join("README.md");
    if !readme.is_file() {
        return Ok(None);
    }
    let readme = readme.canonicalize()?;
    anyhow::ensure!(
        readme.starts_with(directory.canonicalize()?),
        "README must stay inside the module source directory"
    );
    Ok(Some(readme))
}

async fn package_readme(
    package: &registry::Resolved,
    repository: Option<&str>,
    subdir: Option<&Path>,
) -> Result<Option<std::path::PathBuf>> {
    let Some(repository) = repository.or(package.metadata.repository.as_deref()) else {
        return Ok(None);
    };
    let subdir = subdir.or_else(|| package.metadata.subdir.as_deref().map(Path::new));
    crate::git_source::readme(repository, subdir, None).await
}

pub async fn inspect(pipeline: Option<&str>, mode: &str) -> Result<()> {
    let workspace = Workspace::current()?;
    let root = &workspace.root;
    let pipeline = pipeline.unwrap_or(".");
    if pipeline == "."
        && mode == "list"
        && let Some(path) = &workspace.config
    {
        let config = config::Config::read(path)?;
        for module in config.modules {
            println!("{} [{}]", module.name, module.sdk.name());
        }
        for step in config.steps {
            println!("{}", step.name);
        }
        return Ok(());
    }
    if mode == "docs" {
        let declared = if pipeline == "." {
            let mut found = modules::discover(&workspace)?;
            if found.len() == 1 { found.pop() } else { None }
        } else {
            modules::resolve(root, pipeline)?
        };
        if let Some(module) = declared {
            let readme = match &module.source {
                modules::ModuleSource::Git(_) => {
                    let source =
                        crate::lockfile::git_source(root, &module.definition, false, false).await?;
                    source_readme(&source)?
                }
                modules::ModuleSource::Path(source) => source_readme(source)?,
                modules::ModuleSource::Registry(reference) => {
                    let package = crate::lockfile::resolve(root, reference, false).await?;
                    package_readme(
                        &package,
                        module.definition.repository.as_deref(),
                        module.definition.subdir.as_deref(),
                    )
                    .await?
                }
                modules::ModuleSource::Url(_) => {
                    if let Some(repository) = module.definition.repository.as_deref() {
                        crate::git_source::readme(
                            repository,
                            module.definition.subdir.as_deref(),
                            None,
                        )
                        .await?
                    } else {
                        None
                    }
                }
            };
            return render_readme(readme).await;
        }
        if pipeline != "." && !pipeline.contains("://") {
            let package = crate::lockfile::resolve(root, pipeline, false).await?;
            if package.metadata.url.is_some() {
                return render_readme(package_readme(&package, None, None).await?).await;
            }
        }
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
    c.current_dir(root);
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
