// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn cache(input: String) -> Result<Json<Cache>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "cache",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn devbox() -> Result<Json<Devbox>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "devbox",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn devenv() -> Result<Json<Devenv>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "devenv",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn directory(input: String) -> Result<Json<Directory>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "directory",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn envhub() -> Result<Json<Envhub>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "envhub",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn file(input: String) -> Result<Json<File>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "file",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn flox() -> Result<Json<Flox>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "flox",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn git(input: String) -> Result<Json<Git>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "git",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn http(input: String) -> Result<Json<File>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "http",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn hermit() -> Result<Json<Hermit>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "hermit",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn mise() -> Result<Json<Mise>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "mise",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn nix(input: Json<NixArgs>) -> Result<Json<Nix>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "nix",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn pipeline(input: String) -> Result<Json<Pipeline>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "pipeline",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn pixi() -> Result<Json<Pixi>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "pixi",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn proto() -> Result<Json<Proto>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "proto",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn pkgx() -> Result<Json<Pkgx>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "pkgx",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn get_env(input: String) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "get_env",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn has_env(input: String) -> Result<Json<bool>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "has_env",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn set_envs(input: Json<Vec<(String, String)>>) -> Result<(), Error> {
    crate::component::invoke("set_envs", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn remove_env(input: String) -> Result<(), Error> {
    crate::component::invoke("remove_env", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn get_os() -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "get_os",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn get_arch() -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "get_arch",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn call(input: Json<Module>) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "call",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn add_secretmanager(input: Json<Provider>) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "add_secretmanager",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn set_secret(input: Json<Vec<String>>) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "set_secret",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn execute_plan(input: String) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "execute_plan",
        serde_json::to_value(input)?,
    )?)?)
}
