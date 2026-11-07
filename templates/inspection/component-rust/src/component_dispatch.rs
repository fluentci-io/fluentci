// Generated direct typed WIT calls.
fn dispatch(name: &str, input: Value) -> Result<Value, Error> {
    use bindings::fluentci::runtime::api;
    let result = match name {
        "add_secretmanager" => {
            let input: api::SecretProvider = serde_json::from_value(input)?;
            serde_json::to_value(api::add_secretmanager(&input).map_err(Error::msg)?)?
        }
        "as_service" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::as_service(&input).map_err(Error::msg)?)?
        }
        "branch" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::branch(&input).map_err(Error::msg)?)?
        }
        "cache" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::cache(&input).map_err(Error::msg)?)?
        }
        "call" => {
            let input: api::Module = serde_json::from_value(input)?;
            serde_json::to_value(api::call(&input).map_err(Error::msg)?)?
        }
        "chmod" => {
            let input: api::ChmodOptions = serde_json::from_value(input)?;
            serde_json::to_value(api::chmod(&input).map_err(Error::msg)?)?
        }
        "commit" => serde_json::to_value(api::commit().map_err(Error::msg)?)?,
        "devbox" => serde_json::to_value(api::devbox().map_err(Error::msg)?)?,
        "devenv" => serde_json::to_value(api::devenv().map_err(Error::msg)?)?,
        "directory" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::directory(&input).map_err(Error::msg)?)?
        }
        "entries" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::entries(&input).map_err(Error::msg)?)?
        }
        "envhub" => serde_json::to_value(api::envhub().map_err(Error::msg)?)?,
        "file" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::file(&input).map_err(Error::msg)?)?
        }
        "flox" => serde_json::to_value(api::flox().map_err(Error::msg)?)?,
        "get_arch" => serde_json::to_value(api::get_arch().map_err(Error::msg)?)?,
        "get_env" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::get_env(&input).map_err(Error::msg)?)?
        }
        "get_os" => serde_json::to_value(api::get_os().map_err(Error::msg)?)?,
        "get_secret" => {
            let input: Vec<String> = serde_json::from_value(input)?;
            serde_json::to_value(api::get_secret(&input).map_err(Error::msg)?)?
        }
        "get_secret_plaintext" => {
            let input: Vec<String> = serde_json::from_value(input)?;
            serde_json::to_value(api::get_secret_plaintext(&input).map_err(Error::msg)?)?
        }
        "git" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::git(&input).map_err(Error::msg)?)?
        }
        "has_env" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::has_env(&input).map_err(Error::msg)?)?
        }
        "hermit" => serde_json::to_value(api::hermit().map_err(Error::msg)?)?,
        "http" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::http(&input).map_err(Error::msg)?)?
        }
        "install" => serde_json::to_value(api::install().map_err(Error::msg)?)?,
        "md5" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::md5(&input).map_err(Error::msg)?)?
        }
        "mise" => serde_json::to_value(api::mise().map_err(Error::msg)?)?,
        "nix" => {
            let input: api::NixArgs = serde_json::from_value(input)?;
            serde_json::to_value(api::nix(input).map_err(Error::msg)?)?
        }
        "pipeline" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::pipeline(&input).map_err(Error::msg)?)?
        }
        "pixi" => serde_json::to_value(api::pixi().map_err(Error::msg)?)?,
        "pkgx" => serde_json::to_value(api::pkgx().map_err(Error::msg)?)?,
        "proto" => serde_json::to_value(api::proto().map_err(Error::msg)?)?,
        "remove_env" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::remove_env(&input).map_err(Error::msg)?)?
        }
        "set_envs" => {
            let input: Vec<(String, String)> = serde_json::from_value(input)?;
            serde_json::to_value(api::set_envs(&input).map_err(Error::msg)?)?
        }
        "set_runner" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::set_runner(&input).map_err(Error::msg)?)?
        }
        "set_secret" => {
            let input: Vec<String> = serde_json::from_value(input)?;
            serde_json::to_value(api::set_secret(&input).map_err(Error::msg)?)?
        }
        "sha256" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::sha256(&input).map_err(Error::msg)?)?
        }
        "stderr" => serde_json::to_value(api::stderr().map_err(Error::msg)?)?,
        "stdout" => serde_json::to_value(api::stdout().map_err(Error::msg)?)?,
        "tar_czvf" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::tar_czvf(&input).map_err(Error::msg)?)?
        }
        "tar_xzvf" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::tar_xzvf(&input).map_err(Error::msg)?)?
        }
        "tree" => serde_json::to_value(api::tree().map_err(Error::msg)?)?,
        "trust" => serde_json::to_value(api::trust().map_err(Error::msg)?)?,
        "unzip" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::unzip(&input).map_err(Error::msg)?)?
        }
        "wait_on" => {
            let input: Vec<u32> = serde_json::from_value(input)?;
            serde_json::to_value(api::wait_on(&input).map_err(Error::msg)?)?
        }
        "with_cache" => {
            let input: api::CacheHandle = serde_json::from_value(input)?;
            serde_json::to_value(api::with_cache(&input).map_err(Error::msg)?)?
        }
        "with_exec" => {
            let input: Vec<String> = serde_json::from_value(input)?;
            serde_json::to_value(api::with_exec(&input).map_err(Error::msg)?)?
        }
        "with_file" => {
            let input: api::FileHandle = serde_json::from_value(input)?;
            serde_json::to_value(api::with_file(&input).map_err(Error::msg)?)?
        }
        "with_packages" => {
            let input: Vec<String> = serde_json::from_value(input)?;
            serde_json::to_value(api::with_packages(&input).map_err(Error::msg)?)?
        }
        "with_secret_variable" => {
            let input: Vec<String> = serde_json::from_value(input)?;
            serde_json::to_value(api::with_secret_variable(&input).map_err(Error::msg)?)?
        }
        "with_service" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::with_service(&input).map_err(Error::msg)?)?
        }
        "with_workdir" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::with_workdir(&input).map_err(Error::msg)?)?
        }
        "zip" => {
            let input: String = serde_json::from_value(input)?;
            serde_json::to_value(api::zip(&input).map_err(Error::msg)?)?
        }
        _ => return Err(Error::msg("Unknown native host operation")),
    };
    Ok(result)
}
