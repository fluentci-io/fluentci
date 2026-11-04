import fluentci/dagger/directory.{type Directory}
import gleam/javascript/promise.{type Promise}

pub type GitRef

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(git_ref: GitRef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "commit")
pub fn commit(git_ref: GitRef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "tree")
pub fn tree(git_ref: GitRef) -> Directory
