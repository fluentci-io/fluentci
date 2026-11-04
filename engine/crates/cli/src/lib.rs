//! Engine entry points linked into the unified FluentCI CLI.
#[cfg(target_os = "openbsd")]
extern crate extism_openbsd as extism;
pub mod cmd;
pub use fluentci_core::ExecutionFailure;
