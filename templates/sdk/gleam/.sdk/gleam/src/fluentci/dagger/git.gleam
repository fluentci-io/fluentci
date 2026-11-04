import fluentci/dagger/git_ref.{type GitRef}
import fluentci/dagger/secret.{type Secret}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type GitRepository

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(git: GitRepository) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "branch")
pub fn branch(git: GitRepository, name: String) -> GitRef

@external(javascript, "../../dagger_ffi.mjs", "commit")
pub fn commit(git: GitRepository, id: String) -> GitRef

@external(javascript, "../../dagger_ffi.mjs", "head")
pub fn head(git: GitRepository) -> GitRef

@external(javascript, "../../dagger_ffi.mjs", "ref")
pub fn ref(git: GitRepository, name: String) -> GitRef

@external(javascript, "../../dagger_ffi.mjs", "tag")
pub fn tag(git: GitRepository, name: String) -> GitRef

@external(javascript, "../../dagger_ffi.mjs", "tags")
pub fn tags(git: GitRepository) -> Array(String)

@external(javascript, "../../dagger_ffi.mjs", "withAuthHeader")
pub fn with_auth_header(git: GitRepository, header: Secret) -> GitRepository

@external(javascript, "../../dagger_ffi.mjs", "withAuthToken")
pub fn with_auth_token(git: GitRepository, token: Secret) -> GitRepository
