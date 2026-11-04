import fluentci/cache.{type Cache}
import fluentci/devbox.{type Devbox}
import fluentci/devenv.{type Devenv}
import fluentci/directory.{type Directory, type File}
import fluentci/flox.{type Flox}
import fluentci/git.{type Git}
import fluentci/hermit.{type Hermit}
import fluentci/mise.{type Mise}
import fluentci/nix.{type Nix}
import fluentci/pipeline.{type Pipeline}
import fluentci/pixi.{type Pixi}
import fluentci/pkgx.{type Pkgx}
import fluentci/proto.{type Proto}
import fluentci/secret.{type Secret}
import fluentci/secret_manager.{type SecretManager}

pub type Client

pub type NixArgs {
  NixArgs(impure: Bool)
}

@external(javascript, "./fluentci_ffi.mjs", "client")
pub fn dag() -> Client

@external(javascript, "./fluentci_ffi.mjs", "azureSecretsManager")
pub fn azure_secrets_manager(
  client: Client,
  region: String,
  access_key_id: String,
  secret_access_key: String,
) -> SecretManager

@external(javascript, "./fluentci_ffi.mjs", "azureKeyvault")
pub fn azure_keyvault(
  client: Client,
  client_id: String,
  client_secret: String,
  tenant_id: String,
  keyvault_name: String,
  keyvault_url: String,
) -> SecretManager

@external(javascript, "./fluentci_ffi.mjs", "cache")
pub fn cache(client: Client, key: String) -> Cache

@external(javascript, "./fluentci_ffi.mjs", "devbox")
pub fn devbox(client: Client) -> Devbox

@external(javascript, "./fluentci_ffi.mjs", "devenv")
pub fn devenv(client: Client) -> Devenv

@external(javascript, "./fluentci_ffi.mjs", "directory")
pub fn directory(client: Client, path: String) -> Directory

@external(javascript, "./fluentci_ffi.mjs", "file")
pub fn file(client: Client, path: String) -> File

@external(javascript, "./fluentci_ffi.mjs", "flox")
pub fn flox(client: Client) -> Flox

@external(javascript, "./fluentci_ffi.mjs", "git")
pub fn git(client: Client, url: String) -> Git

@external(javascript, "./fluentci_ffi.mjs", "googleCloudSecretManager")
pub fn google_cloud_secret_manager(
  client: Client,
  project: String,
  google_credentials_file: String,
) -> SecretManager

@external(javascript, "./fluentci_ffi.mjs", "hashicorpVault")
pub fn hashicorp_vault(
  client: Client,
  address: String,
  token: String,
  cacerts: String,
) -> SecretManager

@external(javascript, "./fluentci_ffi.mjs", "http")
pub fn http(client: Client, url: String) -> File

@external(javascript, "./fluentci_ffi.mjs", "mise")
pub fn mise(client: Client) -> Mise

@external(javascript, "./fluentci_ffi.mjs", "nix")
pub fn nix(client: Client, args: NixArgs) -> Nix

@external(javascript, "./fluentci_ffi.mjs", "pipeline")
pub fn pipeline(client: Client, name: String) -> Pipeline

@external(javascript, "./fluentci_ffi.mjs", "pixi")
pub fn pixi(client: Client) -> Pixi

@external(javascript, "./fluentci_ffi.mjs", "pkgx")
pub fn pkgx(client: Client) -> Pkgx

@external(javascript, "./fluentci_ffi.mjs", "proto")
pub fn proto(client: Client) -> Proto

@external(javascript, "./fluentci_ffi.mjs", "hermit")
pub fn hermit(client: Client) -> Hermit

@external(javascript, "./fluentci_ffi.mjs", "setSecret")
pub fn set_secret(client: Client, name: String, value: String) -> Secret
