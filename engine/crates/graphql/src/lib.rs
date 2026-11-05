use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use schema::Query;

pub mod schema;
pub mod util;

pub type FluentCISchema = Schema<Query, EmptyMutation, EmptySubscription>;
