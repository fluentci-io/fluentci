// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn set_runner(input: String) -> Result<(), Error> {
    crate::component::invoke("set_runner", serde_json::to_value(input)?)?;
    Ok(())
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
unsafe fn flox() -> Result<Json<Flox>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "flox",
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
unsafe fn pkgx() -> Result<Json<Pkgx>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "pkgx",
        serde_json::Value::Null,
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
unsafe fn hermit() -> Result<Json<Hermit>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "hermit",
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
unsafe fn mise() -> Result<Json<Mise>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "mise",
        serde_json::Value::Null,
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
unsafe fn with_exec(input: Json<Vec<String>>) -> Result<(), Error> {
    crate::component::invoke("with_exec", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn with_workdir(input: String) -> Result<(), Error> {
    crate::component::invoke("with_workdir", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn with_cache(input: Json<Cache>) -> Result<(), Error> {
    crate::component::invoke("with_cache", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn with_file(input: Json<File>) -> Result<(), Error> {
    crate::component::invoke("with_file", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn stdout() -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "stdout",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn stderr() -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "stderr",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn as_service(input: String) -> Result<Json<Service>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "as_service",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn with_service(input: String) -> Result<(), Error> {
    crate::component::invoke("with_service", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn set_envs(input: Json<Vec<(String, String)>>) -> Result<(), Error> {
    crate::component::invoke("set_envs", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn wait_on(input: Json<Vec<u32>>) -> Result<(), Error> {
    crate::component::invoke("wait_on", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn with_secret_variable(input: Json<Vec<String>>) -> Result<(), Error> {
    crate::component::invoke("with_secret_variable", serde_json::to_value(input)?)?;
    Ok(())
}
