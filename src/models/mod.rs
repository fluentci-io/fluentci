//! Shared application models.

mod action;
mod job;
mod log;
mod project;
mod run;
mod search;
mod workflow;
mod workflow_events;

pub use action::Action;
pub use job::Job;
pub use log::Log;
pub use project::Project;
pub use run::Run;
pub use search::SearchResult;
pub use workflow::Workflow;
pub use workflow_events::{WorkflowEvents, WorkflowFilter};

pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
