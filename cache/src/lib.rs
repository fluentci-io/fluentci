//! Multi-protocol build cache. Embed [`router`] with any [`object_store::ObjectStore`].
pub mod config;
pub mod gocache;
mod server;

pub use config::Config;
pub use server::router;
