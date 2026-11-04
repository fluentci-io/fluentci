//! Bounded FIFO admission. A reservation owns either an execution slot or a
//! queue position, and releases it even if worker creation or execution fails.
use fluentci_executor::Cancellation;
use std::{
    collections::VecDeque,
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};

pub(super) struct Admission {
    max_running: usize,
    max_queued: usize,
    state: Mutex<State>,
    changed: Condvar,
}
struct State {
    running: usize,
    queued: VecDeque<String>,
}
pub(super) struct Reservation {
    admission: Arc<Admission>,
    id: String,
    acquired: bool,
}
impl Admission {
    pub fn new(max_running: usize, max_queued: usize) -> Arc<Self> {
        Arc::new(Self {
            max_running,
            max_queued,
            state: Mutex::new(State {
                running: 0,
                queued: VecDeque::new(),
            }),
            changed: Condvar::new(),
        })
    }
    pub fn cancel_queued(&self, id: &str) {
        let mut state = self.state.lock().unwrap();
        state.queued.retain(|queued| queued != id);
        self.changed.notify_all();
    }
    pub fn reserve(self: &Arc<Self>, id: String) -> Option<Reservation> {
        let mut state = self.state.lock().unwrap();
        let acquired = state.running < self.max_running && state.queued.is_empty();
        if acquired {
            state.running += 1;
        } else if state.queued.len() < self.max_queued {
            state.queued.push_back(id.clone());
        } else {
            return None;
        }
        Some(Reservation {
            admission: self.clone(),
            id,
            acquired,
        })
    }
}
impl Reservation {
    pub fn admission(&self) -> Arc<Admission> {
        self.admission.clone()
    }
    pub fn queued(&self) -> bool {
        !self.acquired
    }
    pub fn wait(&mut self, cancel: &Cancellation) -> Result<(), String> {
        let mut state = self.admission.state.lock().unwrap();
        loop {
            if cancel.is_cancelled() {
                return Err("run cancelled before execution".into());
            }
            if self.acquired {
                return Ok(());
            }
            if state.running < self.admission.max_running && state.queued.front() == Some(&self.id)
            {
                state.queued.pop_front();
                state.running += 1;
                self.acquired = true;
                // More than one slot can be available when a batch finishes.
                self.admission.changed.notify_all();
                return Ok(());
            }
            // Cancellation tokens are shared with executor workers, so poll them
            // within a bounded interval even when no slot changes ownership.
            state = self
                .admission
                .changed
                .wait_timeout(state, Duration::from_millis(25))
                .unwrap()
                .0;
        }
    }
}
impl Drop for Reservation {
    fn drop(&mut self) {
        let mut state = self.admission.state.lock().unwrap();
        if self.acquired {
            state.running -= 1;
        } else {
            state.queued.retain(|id| id != &self.id);
        }
        self.admission.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reservations_bound_capacity_and_release_abandoned_queue_positions() {
        let admission = Admission::new(1, 2);
        let running = admission.reserve("run".into()).unwrap();
        assert!(!running.queued());
        let first = admission.reserve("first".into()).unwrap();
        let mut second = admission.reserve("second".into()).unwrap();
        assert!(first.queued() && second.queued());
        assert!(admission.reserve("full".into()).is_none());
        drop(first);
        let third = admission.reserve("third".into()).unwrap();
        drop(running);
        second.wait(&Cancellation::default()).unwrap();
        assert!(!second.queued());
        assert_eq!(
            admission.state.lock().unwrap().queued.front(),
            Some(&"third".to_owned())
        );
        drop(second);
        drop(third);
        assert_eq!(admission.state.lock().unwrap().running, 0);
    }
}
