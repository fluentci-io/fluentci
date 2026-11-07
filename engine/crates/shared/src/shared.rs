use crate::state::State;
use extism::{convert::Json, *};
use fluentci_secrets::Provider;
use fluentci_types::Module;
use fluentci_types::{cache::Cache, file::File};

host_fn!(pub set_runner(user_data: State; runner: String) {
    fluentci_common::host::set_runner(&user_data.get()?, runner)
});

host_fn!(pub with_exec(user_data: State; args: Json<Vec<String>>) {
    fluentci_common::host::with_exec(&user_data.get()?, fluentci_common::host::Json(args.into_inner()))
});

host_fn!(pub with_workdir(user_data: State; path: String) {
    fluentci_common::host::with_workdir(&user_data.get()?, path)
});

host_fn!(pub with_cache(user_data: State;  cache: Json<Cache>) {
    fluentci_common::host::with_cache(&user_data.get()?, fluentci_common::host::Json(cache.into_inner()))
});

host_fn!(pub with_file(user_data: State;  file: Json<File>) {
    fluentci_common::host::with_file(&user_data.get()?, fluentci_common::host::Json(file.into_inner()))
});

host_fn!(pub with_service(user_data: State; service_id: String) {
    fluentci_common::host::with_service(&user_data.get()?, service_id)
});

host_fn!(pub stdout(user_data: State;) -> String {
    fluentci_common::host::stdout(&user_data.get()?)
});

host_fn!(pub stderr(user_data: State;) -> String {
    fluentci_common::host::stderr(&user_data.get()?)
});

host_fn!(pub zip(user_data: State; path: String) -> Json<File> {
    fluentci_common::host::zip(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});

host_fn!(pub tar_czvf(user_data: State; path: String) -> Json<File> {
    fluentci_common::host::tar_czvf(&user_data.get()?, path).map(|value| Json(value.into_inner()))
});

host_fn!(pub get_env(user_data: State; key: String) -> String {
    fluentci_common::host::get_env(&user_data.get()?, key)
});

host_fn!(pub set_envs(user_data: State; env: Json<Vec<(String, String)>>) {
    fluentci_common::host::set_envs(&user_data.get()?, fluentci_common::host::Json(env.into_inner()))
});

host_fn!(pub remove_env(user_data: State; key: String) {
    fluentci_common::host::remove_env(&user_data.get()?, key)
});

host_fn!(pub has_env(user_data: State; key: String) -> Json<bool> {
    fluentci_common::host::has_env(&user_data.get()?, key).map(|value| Json(value.into_inner()))
});

host_fn!(pub get_os(user_data: State;) -> String {
    fluentci_common::host::get_os(&user_data.get()?)
});

host_fn!(pub get_arch(user_data: State;) -> String {
    fluentci_common::host::get_arch(&user_data.get()?)
});

host_fn!(pub as_service(user_data: State; name: String) -> Json<Service> {
    fluentci_common::host::as_service(&user_data.get()?, name).map(|value| Json(value.into_inner()))
});

host_fn!(pub call(user_data: State; opts: Json<Module>) -> String {
    let context=user_data.get()?;
    { let mut state=context.lock().unwrap(); if state.caller.is_none() {state.caller=Some(crate::module_call::invoke);} }
    fluentci_common::host::call(&context, fluentci_common::host::Json(opts.into_inner()))
});

host_fn!(pub wait_on(user_data: State; args: Json<Vec<u32>>) {
    fluentci_common::host::wait_on(&user_data.get()?, fluentci_common::host::Json(args.into_inner()))
});

host_fn!(pub add_secretmanager(user_data: State; provider: Json<Provider>) -> String {
    fluentci_common::host::add_secretmanager(&user_data.get()?, fluentci_common::host::Json(provider.into_inner()))
});

host_fn!(pub get_secret(user_data: State; params: Json<Vec<String>>) -> Json<Vec<Secret>> {
    fluentci_common::host::get_secret(&user_data.get()?, fluentci_common::host::Json(params.into_inner())).map(|value| Json(value.into_inner()))
});

host_fn!(pub with_secret_variable(user_data: State; params: Json<Vec<String>>) {
    fluentci_common::host::with_secret_variable(&user_data.get()?, fluentci_common::host::Json(params.into_inner()))
});

host_fn!(pub set_secret(user_data: State; params: Json<Vec<String>>) -> String {
    fluentci_common::host::set_secret(&user_data.get()?, fluentci_common::host::Json(params.into_inner()))
});

host_fn!(pub get_secret_plaintext(user_data: State; params: Json<Vec<String>>) -> String {
    fluentci_common::host::get_secret_plaintext(&user_data.get()?, fluentci_common::host::Json(params.into_inner()))
});
