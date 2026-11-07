// OpenBSD's native Rust 1.90 requires the compatible runtime line.
#[cfg(target_os = "openbsd")]
extern crate extism_openbsd as extism;

pub mod cache;
pub mod devbox;
pub mod devenv;
pub mod directory;
pub mod envhub;
pub mod execution;
pub mod file;
pub mod flox;
pub mod git;
pub mod hermit;
pub mod http;
pub mod mise;
pub mod nix;
pub mod pipeline;
pub mod pixi;
pub mod pkgx;
pub mod proto;
pub mod shared;
pub mod state;

#[path = "generated/host_functions.rs"]
pub mod host;

pub mod module_call;

pub use fluentci_common::module_dependencies;
