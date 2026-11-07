// Generated native component transport; no Extism host imports.
#[allow(dead_code)]
unsafe fn zip(input: String) -> Result<Json<File>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "zip",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn unzip(input: String) -> Result<Json<Directory>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "unzip",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn tar_czvf(input: String) -> Result<Json<File>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "tar_czvf",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn tar_xzvf(input: String) -> Result<Json<Directory>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "tar_xzvf",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn md5(input: String) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "md5",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn sha256(input: String) -> Result<String, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "sha256",
        serde_json::to_value(input)?,
    )?)?)
}
#[allow(dead_code)]
unsafe fn chmod(input: Json<Chmod>) -> Result<Json<File>, Error> {
    Ok(serde_json::from_value(crate::component::invoke(
        "chmod",
        serde_json::to_value(input)?,
    )?)?)
}
