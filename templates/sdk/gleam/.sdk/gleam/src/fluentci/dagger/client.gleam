import fluentci/dagger/cache_volume.{type CacheVolume}
import fluentci/dagger/container.{type Container}
import fluentci/dagger/directory.{type Directory}
import fluentci/dagger/file.{type File}
import fluentci/dagger/git.{type GitRepository}
import fluentci/dagger/host.{type Host}

pub type Client

@external(javascript, "../../dagger_ffi.mjs", "client")
pub fn dag() -> Client

@external(javascript, "../../dagger_ffi.mjs", "pipeline")
pub fn pipeline(client: Client, name: String) -> Client

@external(javascript, "../../dagger_ffi.mjs", "container")
pub fn container(client: Client) -> Container

@external(javascript, "../../dagger_ffi.mjs", "cacheVolume")
pub fn cache_volume(client: Client, key: String) -> CacheVolume

@external(javascript, "../../dagger_ffi.mjs", "emptyDirectory")
pub fn directory(client: Client) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "git")
pub fn git(client: Client, url: String) -> GitRepository

@external(javascript, "../../dagger_ffi.mjs", "host")
pub fn host(client: Client) -> Host

@external(javascript, "../../dagger_ffi.mjs", "http")
pub fn http(client: Client, url: String) -> File
