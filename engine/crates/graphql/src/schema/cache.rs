use std::sync::{Arc, Mutex};

use super::objects::cache::Cache;
use async_graphql::{Context, Error, Object};
use fluentci_common::cache::cache as common_cache;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct CacheQuery;

#[Object]
impl CacheQuery {
    async fn cache(&self, ctx: &Context<'_>, key: String) -> Result<Cache, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let cache = common_cache(graph.clone(), &key)?;
        Ok(Cache::from(cache))
    }
}
