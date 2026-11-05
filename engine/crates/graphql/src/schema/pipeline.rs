use std::sync::{Arc, Mutex};

use super::objects::pipeline::Pipeline;
use async_graphql::{Context, Error, Object};
use fluentci_common::pipeline::pipeline as common_pipeline;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct PipelineQuery;

#[Object]
impl PipelineQuery {
    async fn pipeline(&self, ctx: &Context<'_>, name: String) -> Result<Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let pipeline = common_pipeline(graph.clone(), name)?;
        Ok(Pipeline::from(pipeline))
    }
}
