use async_graphql::{InputObject, SimpleObject};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "ActionInput")]
#[serde(rename_all = "camelCase")]
pub struct Action {
    #[graphql(skip_input)]
    pub id: Option<String>,
    pub name: String,
    pub commands: String,
    pub enabled: bool,
    pub plugin: String,
    pub use_wasm: bool,
    pub logo: Option<String>,
    pub github_url: Option<String>,
    pub env: Option<Vec<String>>,
    pub working_directory: Option<String>,
}
