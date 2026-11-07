// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn branch(input: String) -> Result<(), Error> {
    crate::component::invoke("branch", serde_json::to_value(input)?)?;
    Ok(())
}
#[allow(dead_code)]
unsafe fn commit() -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "commit",
        serde_json::Value::Null,
    )?)?)
}
#[allow(dead_code)]
unsafe fn tree() -> Result<Json<Directory>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "tree",
        serde_json::Value::Null,
    )?)?)
}
