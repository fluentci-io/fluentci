// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn get_secret(input: Json<Vec<String>>) -> Result<Json<Vec<types::Secret>>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "get_secret",
        serde_json::to_value(input)?,
    )?)?)
}
