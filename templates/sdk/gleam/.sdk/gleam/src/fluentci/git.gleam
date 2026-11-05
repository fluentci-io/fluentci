import fluentci/directory.{type Directory}
import gleam/javascript/promise.{type Promise}

pub type Git

@external(javascript, "../fluentci_ffi.mjs", "git")
pub fn branch(g: Git, name: String) -> Git

@external(javascript, "../fluentci_ffi.mjs", "commit")
pub fn commit(g: Git) -> Git

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(g: Git) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "tree")
pub fn tree(g: Git) -> Directory
