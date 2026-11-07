//! Runtime-neutral SDK host operations shared by Extism and WIT components.
use crate::common;
use crate::{
    cache::cache as common_cache,
    devbox::devbox as common_devbox,
    devenv::devenv as common_devenv,
    directory::{directory as common_directory, entries as common_entries},
    envhub::envhub as common_envhub,
    file::{self, file as common_file},
    flox::flox as common_flox,
    git::{
        branch as common_branch, commit as common_commit, git as common_git, tree as common_tree,
    },
    hermit as common_hermit,
    http::http as common_http,
    mise as common_mise,
    nix::nix as common_nix,
    pipeline::pipeline as common_pipeline,
    pixi::pixi as common_pixi,
    pkgx as common_pkgx,
    proto::proto as common_proto,
};
use anyhow::{Context as _, Error};
use fluentci_core::deps::Graph;
use fluentci_ext::devbox::Devbox as DevboxExt;
use fluentci_ext::devenv::Devenv as DevenvExt;
use fluentci_ext::envhub::Envhub as EnvhubExt;
use fluentci_ext::flox::Flox as FloxExt;
use fluentci_ext::git::Git as GitExt;
use fluentci_ext::hermit::Hermit as HermitExt;
use fluentci_ext::http::Http as HttpExt;
use fluentci_ext::mise::Mise as MiseExt;
use fluentci_ext::nix::Nix as NixExt;
use fluentci_ext::pixi::Pixi as PixiExt;
use fluentci_ext::pkgx::Pkgx as PkgxExt;
use fluentci_ext::runner::Runner as RunnerExt;
use fluentci_ext::Extension;
use fluentci_secrets::Provider;
use fluentci_types::{
    cache::Cache,
    devbox::Devbox,
    devenv::Devenv,
    directory::Directory,
    envhub::Envhub,
    file::{Chmod, File},
    flox::Flox,
    git::Git,
    hermit::Hermit,
    mise::Mise,
    nix::{Nix, NixArgs},
    pipeline::Pipeline,
    pixi::Pixi,
    pkgx::Pkgx,
    proto::Proto,
    secret::Secret,
    service::Service,
    Module,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
};

pub type Context = Arc<Mutex<State>>;
pub type ModuleCaller = fn(&Context, Module) -> Result<String, Error>;

pub struct State {
    pub graph: Arc<Mutex<Graph>>,
    pub rx: Arc<Mutex<Receiver<(String, usize)>>>,
    pub runner: String,
    pub execution_failure: Arc<Mutex<Option<fluentci_executor::diagnostics::ExecutionFailure>>>,
    pub caller: Option<ModuleCaller>,
    pub call_depth: usize,
    pub dependency_scopes: Vec<std::collections::BTreeMap<String, Vec<u8>>>,
}

impl State {
    pub fn new(cancellation: fluentci_executor::Cancellation) -> Context {
        let (tx, rx) = mpsc::channel();
        let mut graph = Graph::new(tx, Arc::new(Box::new(RunnerExt::default())));
        graph.cancellation = cancellation;
        Arc::new(Mutex::new(Self {
            graph: Arc::new(Mutex::new(graph)),
            rx: Arc::new(Mutex::new(rx)),
            runner: "default".into(),
            execution_failure: Arc::new(Mutex::new(None)),
            caller: None,
            call_depth: 0,
            dependency_scopes: vec![],
        }))
    }
}

#[derive(Serialize, Deserialize)]
#[serde(transparent)]
pub struct Json<T>(pub T);

impl<T> Json<T> {
    pub fn into_inner(self) -> T {
        self.0
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    plan: fluentci_executor::Plan,
    run_dir: PathBuf,
}

pub fn cache(user_data: &Context, key: String) -> Result<Json<Cache>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let cache = common_cache(graph, &key)?;
    Ok(Json(cache))
}

pub fn devbox(user_data: &Context) -> Result<Json<Devbox>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let devbox = common_devbox(graph, true)?;
    Ok(Json(devbox))
}

pub fn devenv(user_data: &Context) -> Result<Json<Devenv>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let devenv = common_devenv(graph, true)?;
    Ok(Json(devenv))
}

pub fn directory(user_data: &Context, path: String) -> Result<Json<Directory>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let directory = common_directory(graph, path, true)?;

    Ok(Json(directory))
}

pub fn entries(_user_data: &Context, path: String) -> Result<Json<Vec<String>>, Error> {
    match common_entries(path) {
        Ok(entries) => Ok(Json(entries)),
        Err(err) => Err(err),
    }
}

pub fn envhub(user_data: &Context) -> Result<Json<Envhub>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let envhub = common_envhub(graph, true)?;
    Ok(Json(envhub))
}

pub fn execute_typed(
    user_data: &Context,
    mut plan: fluentci_executor::Plan,
    mut run_dir: PathBuf,
) -> Result<fluentci_executor::RunResult, Error> {
    let base = std::env::current_dir()?;
    plan.resolve_paths(&base).map_err(Error::msg)?;
    anyhow::ensure!(
        !run_dir.as_os_str().is_empty(),
        "run_dir must name a fresh directory"
    );
    if run_dir.is_relative() {
        run_dir = base.join(run_dir);
    }
    let cancellation = user_data
        .lock()
        .unwrap()
        .graph
        .lock()
        .unwrap()
        .cancellation
        .clone();
    let report = fluentci_core::execute_plan(&plan, &run_dir, &cancellation)?;
    if let Some(failure) = report.failure() {
        *user_data.lock().unwrap().execution_failure.lock().unwrap() = Some(failure);
    }
    Ok(report)
}

pub fn execute_plan(user_data: &Context, request: String) -> Result<String, Error> {
    let request: Request = serde_json::from_str(&request)?;
    Ok(serde_json::to_string(&execute_typed(
        user_data,
        request.plan,
        request.run_dir,
    )?)?)
}

pub fn file(user_data: &Context, path: String) -> Result<Json<File>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let file = common_file(graph, path, true)?;
    Ok(Json(file))
}

pub fn unzip(user_data: &Context, path: String) -> Result<Json<Directory>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    match file::unzip(graph, path, None) {
        Ok(directory) => Ok(Json(directory)),
        Err(e) => Err(e),
    }
}

pub fn tar_xzvf(user_data: &Context, path: String) -> Result<Json<Directory>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    match file::tar_xzvf(graph, path, None) {
        Ok(directory) => Ok(Json(directory)),
        Err(e) => Err(e),
    }
}

pub fn md5(user_data: &Context, path: String) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    file::md5(graph, path)
}

pub fn sha256(user_data: &Context, path: String) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    file::sha256(graph, path)
}

pub fn chmod(user_data: &Context, options: Json<Chmod>) -> Result<Json<File>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let options = options.into_inner();
    let path = options.path.clone();
    let mode = options.mode.clone();
    let file = file::chmod(graph, path, mode)?;

    Ok(Json(file))
}

pub fn flox(user_data: &Context) -> Result<Json<Flox>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let flox = common_flox(graph, true)?;
    Ok(Json(flox))
}

pub fn git(user_data: &Context, url: String) -> Result<Json<Git>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let git = common_git(graph, url, true)?;
    Ok(Json(git))
}

pub fn branch(user_data: &Context, name: String) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_branch(graph, name)
}

pub fn commit(user_data: &Context) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_commit(graph)
}

pub fn tree(user_data: &Context) -> Result<Json<Directory>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let directory = common_tree(graph)?;
    Ok(Json(directory))
}

pub fn hermit(user_data: &Context) -> Result<Json<Hermit>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let hermit = common_hermit::hermit(graph, true)?;
    Ok(Json(hermit))
}

pub fn install(user_data: &Context) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_hermit::install(graph)?;
    Ok(())
}

pub fn http(user_data: &Context, url: String) -> Result<Json<File>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let file = common_http(graph, url, true)?;
    Ok(Json(file))
}

pub fn mise(user_data: &Context) -> Result<Json<Mise>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let mise = common_mise::mise(graph, true)?;
    Ok(Json(mise))
}

pub fn trust(user_data: &Context) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_mise::trust(graph)?;
    Ok(())
}

pub fn nix(user_data: &Context, args: Json<NixArgs>) -> Result<Json<Nix>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let args = args.into_inner();
    let nix = common_nix(graph, true, args)?;
    Ok(Json(nix))
}

pub fn pipeline(user_data: &Context, name: String) -> Result<Json<Pipeline>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let pipeline = common_pipeline(graph, name)?;
    Ok(Json(pipeline))
}

pub fn pixi(user_data: &Context) -> Result<Json<Pixi>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let pixi = common_pixi(graph, true)?;
    Ok(Json(pixi))
}

pub fn pkgx(user_data: &Context) -> Result<Json<Pkgx>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let pkgx = common_pkgx::pkgx(graph, true)?;
    Ok(Json(pkgx))
}

pub fn with_packages(user_data: &Context, packages: Json<Vec<String>>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let packages = packages.into_inner();
    common_pkgx::with_packages(graph, packages)?;
    Ok(())
}

pub fn proto(user_data: &Context) -> Result<Json<Proto>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let proto = common_proto(graph, true)?;
    Ok(Json(proto))
}

pub fn set_runner(user_data: &Context, runner: String) -> Result<(), Error> {
    let state = user_data.clone();
    let mut state = state.lock().unwrap();
    state.runner = runner;
    Ok(())
}

pub fn with_exec(user_data: &Context, args: Json<Vec<String>>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let runner = state.runner.clone();
    let runner: Arc<Box<dyn Extension + Send + Sync>> = match runner.as_str() {
        "nix" => Arc::new(Box::new(NixExt::default())),
        "devbox" => Arc::new(Box::new(DevboxExt::default())),
        "devenv" => Arc::new(Box::new(DevenvExt::default())),
        "envhub" => Arc::new(Box::new(EnvhubExt::default())),
        "flox" => Arc::new(Box::new(FloxExt::default())),
        "git" => Arc::new(Box::new(GitExt::default())),
        "http" => Arc::new(Box::new(HttpExt::default())),
        "mise" => Arc::new(Box::new(MiseExt::default())),
        "runner" => Arc::new(Box::new(RunnerExt::default())),
        "pixi" => Arc::new(Box::new(PixiExt::default())),
        "pkgx" => Arc::new(Box::new(PkgxExt::default())),
        "hermit" => Arc::new(Box::new(HermitExt::default())),
        _ => Arc::new(Box::new(RunnerExt::default())),
    };
    common::with_exec(graph, args.into_inner(), runner)?;
    Ok(())
}

pub fn with_workdir(user_data: &Context, path: String) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let runner = state.runner.clone();
    let runner: Arc<Box<dyn Extension + Send + Sync>> = match runner.as_str() {
        "nix" => Arc::new(Box::new(NixExt::default())),
        "devbox" => Arc::new(Box::new(DevboxExt::default())),
        "devenv" => Arc::new(Box::new(DevenvExt::default())),
        "envhub" => Arc::new(Box::new(EnvhubExt::default())),
        "flox" => Arc::new(Box::new(FloxExt::default())),
        "git" => Arc::new(Box::new(GitExt::default())),
        "http" => Arc::new(Box::new(HttpExt::default())),
        "mise" => Arc::new(Box::new(MiseExt::default())),
        "runner" => Arc::new(Box::new(RunnerExt::default())),
        "pixi" => Arc::new(Box::new(PixiExt::default())),
        "pkgx" => Arc::new(Box::new(PkgxExt::default())),
        "hermit" => Arc::new(Box::new(HermitExt::default())),
        _ => Arc::new(Box::new(RunnerExt::default())),
    };
    common::with_workdir(graph, path, runner)?;
    Ok(())
}

pub fn with_cache(user_data: &Context, cache: Json<Cache>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let cache = cache.into_inner();
    common::with_cache(graph, cache.id, cache.path)?;
    Ok(())
}

pub fn with_file(user_data: &Context, file: Json<File>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let file = file.into_inner();
    common::with_file(graph, file.id, file.path)?;
    Ok(())
}

pub fn with_service(user_data: &Context, service_id: String) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common::with_service(graph, service_id)?;
    Ok(())
}

pub fn stdout(user_data: &Context) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let rx = state.rx.clone();
    let response = common::stdout(graph, rx);
    if let Err(error) = &response {
        if let Some(failure) =
            error.downcast_ref::<fluentci_executor::diagnostics::ExecutionFailure>()
        {
            *state.execution_failure.lock().unwrap() = Some(failure.clone());
        }
    }
    response
}

pub fn stderr(user_data: &Context) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let rx = state.rx.clone();
    let response = common::stderr(graph, rx);
    if let Err(error) = &response {
        if let Some(failure) =
            error.downcast_ref::<fluentci_executor::diagnostics::ExecutionFailure>()
        {
            *state.execution_failure.lock().unwrap() = Some(failure.clone());
        }
    }
    response
}

pub fn zip(user_data: &Context, path: String) -> Result<Json<File>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    match common::zip(graph, path) {
        Ok(file) => Ok(Json(file)),
        Err(e) => Err(e),
    }
}

pub fn tar_czvf(user_data: &Context, path: String) -> Result<Json<File>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    match common::tar_czvf(graph, path) {
        Ok(file) => Ok(Json(file)),
        Err(e) => Err(e),
    }
}

pub fn get_env(user_data: &Context, key: String) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.lock().unwrap();
    Ok(graph.environment.get(&key).cloned().unwrap_or_default())
}

pub fn set_envs(user_data: &Context, env: Json<Vec<(String, String)>>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let mut graph = state.graph.lock().unwrap();
    for (key, value) in env.into_inner() {
        graph.environment.insert(key, value);
    }
    Ok(())
}

pub fn remove_env(user_data: &Context, key: String) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    state.graph.lock().unwrap().environment.remove(&key);
    Ok(())
}

pub fn has_env(user_data: &Context, key: String) -> Result<Json<bool>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let present = state.graph.lock().unwrap().environment.contains_key(&key);
    Ok(Json(present))
}

pub fn get_os(_user_data: &Context) -> Result<String, Error> {
    Ok(std::env::consts::OS.to_string())
}

pub fn get_arch(_user_data: &Context) -> Result<String, Error> {
    Ok(std::env::consts::ARCH.to_string())
}

pub fn as_service(user_data: &Context, name: String) -> Result<Json<Service>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let service = common::as_service(graph, name)?;
    Ok(Json(service))
}

pub fn call(user_data: &Context, opts: Json<Module>) -> Result<String, Error> {
    let caller = user_data
        .lock()
        .unwrap()
        .caller
        .context("No nested module runtime configured")?;
    {
        let mut state = user_data.lock().unwrap();
        anyhow::ensure!(state.call_depth < 64, "Nested module call depth exceeds 64");
        state.call_depth += 1;
    }
    let result = caller(user_data, opts.into_inner());
    user_data.lock().unwrap().call_depth -= 1;
    result
}

pub fn wait_on(user_data: &Context, args: Json<Vec<u32>>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let args = args.into_inner();

    if args.len() == 1 {
        common::wait_on(graph, args[0], None)?;
        return Ok(());
    }
    if args.len() >= 2 {
        common::wait_on(graph, args[0], Some(args[1]))?;
    }
    Ok(())
}

pub fn add_secretmanager(user_data: &Context, provider: Json<Provider>) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let provider = provider.into_inner();
    let id = common::add_secretmanager(graph, provider)?;
    Ok(id)
}

pub fn get_secret(
    user_data: &Context,
    params: Json<Vec<String>>,
) -> Result<Json<Vec<Secret>>, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let params = params.into_inner();

    if params.len() != 2 {
        return Err(Error::msg("Invalid number of arguments"));
    }

    let secret = common::get_secret(graph, &params[0], &params[1])?;
    Ok(Json(secret))
}

pub fn with_secret_variable(user_data: &Context, params: Json<Vec<String>>) -> Result<(), Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let params = params.into_inner();
    if params.len() != 2 {
        return Err(Error::msg("Invalid number of arguments"));
    }
    let g = graph.lock().unwrap();
    let secret_name = g
        .secret_names
        .get(&params[1])
        .context("Unknown secret handle")?;
    let secret_name = secret_name.clone();
    drop(g);

    common::with_secret_variable(graph, &params[0], &params[1], &secret_name)?;
    Ok(())
}

pub fn set_secret(user_data: &Context, params: Json<Vec<String>>) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let params = params.into_inner();

    if params.len() != 2 {
        return Err(Error::msg("Invalid number of arguments"));
    }

    let secret_id = common::set_secret(graph, &params[0], &params[1])?;
    Ok(secret_id)
}

pub fn get_secret_plaintext(
    user_data: &Context,
    params: Json<Vec<String>>,
) -> Result<String, Error> {
    let state = user_data.clone();
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let params = params.into_inner();

    if params.len() != 2 {
        return Err(Error::msg("Invalid number of arguments"));
    }

    let secret = common::get_secret_plaintext(graph, &params[0], &params[1])?;
    Ok(secret)
}

include!("host_dispatch.rs");
