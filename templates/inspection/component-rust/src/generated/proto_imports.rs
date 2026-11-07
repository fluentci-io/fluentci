// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn set_runner(input: String) -> Result<(), Error> {
    crate::component::invoke("set_runner", serde_json::to_value(input)?)?;
    Ok(())
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
unsafe fn add_secretmanager(input: Json<Provider>) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "add_secretmanager",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn with_secret_variable(input: Json<Vec<String>>) -> Result<(), Error> {
    crate::component::invoke("with_secret_variable", serde_json::to_value(input)?)?;
    Ok(())
}
