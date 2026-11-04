use async_graphql::MergedObject;
use hermit::HermitQuery;

use self::{
    cache::CacheQuery, devbox::DevboxQuery, devenv::DevenvQuery, directory::DirectoryQuery,
    file::FileQuery, flox::FloxQuery, git::GitQuery, http::HttpQuery, mise::MiseQuery,
    nix::NixQuery, pipeline::PipelineQuery, pixi::PixiQuery, pkgx::PkgxQuery, proto::ProtoQuery,
    secrets::SecretsQuery,
};

pub mod cache;
pub mod devbox;
pub mod devenv;
pub mod directory;
pub mod envhub;
pub mod file;
pub mod flox;
pub mod git;
pub mod hermit;
pub mod http;
pub mod mise;
pub mod nix;
pub mod objects;
pub mod pipeline;
pub mod pixi;
pub mod pkgx;
pub mod proto;
pub mod secrets;

#[derive(Default, MergedObject)]
pub struct Query(
    PipelineQuery,
    CacheQuery,
    HttpQuery,
    DirectoryQuery,
    FileQuery,
    GitQuery,
    DevboxQuery,
    DevenvQuery,
    FloxQuery,
    NixQuery,
    PkgxQuery,
    MiseQuery,
    PixiQuery,
    ProtoQuery,
    SecretsQuery,
    HermitQuery,
);
