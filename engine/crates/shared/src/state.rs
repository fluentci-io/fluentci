use std::sync::{mpsc::Receiver, Arc, Mutex};

use fluentci_core::deps::Graph;

pub struct State {
    pub graph: Arc<Mutex<Graph>>,
    pub rx: Arc<Mutex<Receiver<(String, usize)>>>,
    pub runner: String,
    pub execution_failure: Arc<Mutex<Option<fluentci_executor::diagnostics::ExecutionFailure>>>,
}
