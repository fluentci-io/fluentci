use crate::state::State;
use anyhow::Error;
use extism::{convert::Json, host_fn};
use extism::{Manifest, PluginBuilder, Wasm};
use fluentci_common::common;
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
use fluentci_types::cache::Cache;
use fluentci_types::file::File;
use fluentci_types::Module;
use std::sync::Arc;

host_fn!(pub set_runner(user_data: State; runner: String) {
  let state = user_data.get()?;
  let mut state = state.lock().unwrap();
  state.runner = runner;
  Ok(())
});

host_fn!(pub with_exec(user_data: State; args: Json<Vec<String>>) {
  let state = user_data.get()?;
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
});

host_fn!(pub with_workdir(user_data: State; path: String) {
  let state = user_data.get()?;
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
});

host_fn!(pub with_cache(user_data: State;  cache: Json<Cache>) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let cache = cache.into_inner();
  common::with_cache(graph, cache.id, cache.path)?;
  Ok(())
});

host_fn!(pub with_file(user_data: State;  file: Json<File>) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let file = file.into_inner();
  common::with_file(graph, file.id, file.path)?;
  Ok(())
});

host_fn!(pub with_service(user_data: State; service_id: String) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  common::with_service(graph, service_id)?;
  Ok(())
});

host_fn!(pub stdout(user_data: State;) -> String {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let rx = state.rx.clone();
  let response = common::stdout(graph, rx);
  if let Err(error) = &response {
    if let Some(failure) = error.downcast_ref::<fluentci_executor::diagnostics::ExecutionFailure>() {
      *state.execution_failure.lock().unwrap() = Some(failure.clone());
    }
  }
  response
});

host_fn!(pub stderr(user_data: State;) -> String {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let rx = state.rx.clone();
  let response = common::stderr(graph, rx);
  if let Err(error) = &response {
    if let Some(failure) = error.downcast_ref::<fluentci_executor::diagnostics::ExecutionFailure>() {
      *state.execution_failure.lock().unwrap() = Some(failure.clone());
    }
  }
  response
});

host_fn!(pub zip(user_data: State; path: String) -> Json<File> {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  match common::zip(graph, path) {
    Ok(file) => Ok(Json(file)),
    Err(e) => Err(e),
  }
});

host_fn!(pub tar_czvf(user_data: State; path: String) -> Json<File> {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  match common::tar_czvf(graph, path) {
    Ok(file) => Ok(Json(file)),
    Err(e) => Err(e),
  }
});

host_fn!(pub get_env(user_data: State; key: String) -> String {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.lock().unwrap();
  Ok(graph.environment.get(&key).cloned().unwrap_or_default())
});

host_fn!(pub set_envs(user_data: State; env: Json<Vec<(String, String)>>) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let mut graph = state.graph.lock().unwrap();
  for (key, value) in env.into_inner() { graph.environment.insert(key, value); }
  Ok(())
});

host_fn!(pub remove_env(user_data: State; key: String) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  state.graph.lock().unwrap().environment.remove(&key);
  Ok(())
});

host_fn!(pub has_env(user_data: State; key: String) -> Json<bool> {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let present = state.graph.lock().unwrap().environment.contains_key(&key);
  Ok(Json(present))
});

host_fn!(pub get_os(user_data: State;) -> String {
  Ok(std::env::consts::OS.to_string())
});

host_fn!(pub get_arch(user_data: State;) -> String {
  Ok(std::env::consts::ARCH.to_string())
});

host_fn!(pub as_service(user_data: State; name: String) -> Json<Service> {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let service = common::as_service(graph, name)?;
  Ok(Json(service))
});

host_fn!(pub call(user_data: State; opts: Json<Module>) -> String {
    let opts = opts.into_inner();
    let module = opts.url.clone();
    let module = match module.starts_with("http") {
        true => Wasm::url(module),
        false => Wasm::file(module),
    };

    let manifest = Manifest::new([module]);
    let mut plugin = crate::host::register(
        PluginBuilder::new(manifest).with_wasi(true),
        user_data,
    ).build()?;

      let func = opts.function.clone();
      let args = opts.args.clone();
      let result = plugin.call::<&str, &str>(func, &args)?;
      Ok(result.to_string())
});

host_fn!(pub wait_on(user_data: State; args: Json<Vec<u32>>) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let args = args.into_inner();

  if args.len() == 1 {
    common::wait_on(graph, args[0], None)?;
    return Ok(())
  }
  if args.len() >= 2 {
    common::wait_on(graph, args[0], Some(args[1]))?;
  }
  Ok(())
});

host_fn!(pub add_secretmanager(user_data: State; provider: Json<Provider>) -> String {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let provider = provider.into_inner();
  let id = common::add_secretmanager(graph, provider)?;
  Ok(id)
});

host_fn!(pub get_secret(user_data: State; params: Json<Vec<String>>) -> Json<Vec<Secret>> {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let params = params.into_inner();

  if params.len() != 2 {
    return Err(Error::msg("Invalid number of arguments"));
  }

  let secret = common::get_secret(graph, &params[0], &params[1])?;
  Ok(Json(secret))
});

host_fn!(pub with_secret_variable(user_data: State; params: Json<Vec<String>>) {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let params = params.into_inner();
  if params.len() != 2 {
    return Err(Error::msg("Invalid number of arguments"));
  }
  let g = graph.lock().unwrap();
  let secret_name = g.secret_names.get(&params[1]).unwrap();
  let secret_name = secret_name.clone();
  drop(g);

  common::with_secret_variable(graph, &params[0], &params[1], &secret_name)?;
  Ok(())
});

host_fn!(pub set_secret(user_data: State; params: Json<Vec<String>>) -> String {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let params = params.into_inner();

  if params.len() != 2 {
    return Err(Error::msg("Invalid number of arguments"));
  }

  let secret_id = common::set_secret(graph, &params[0], &params[1])?;
  Ok(secret_id)
});

host_fn!(pub get_secret_plaintext(user_data: State; params: Json<Vec<String>>) -> String {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let params = params.into_inner();

  if params.len() != 2 {
    return Err(Error::msg("Invalid number of arguments"));
  }

  let secret = common::get_secret_plaintext(graph, &params[0], &params[1])?;
  Ok(secret)
});
