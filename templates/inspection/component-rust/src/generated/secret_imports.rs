// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn get_secret_plaintext(input: Json<Vec<String>>) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "get_secret_plaintext",
        serde_json::to_value(input)?,
    )?)?)
}
