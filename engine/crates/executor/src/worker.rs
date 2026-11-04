//! Owned background work: cancellation and joining precede resource teardown.
use crate::Cancellation;
use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{mpsc, Arc, Condvar, Mutex},
    thread::{self, JoinHandle},
    time::Duration,
};

/// Coalescing notification: a completion before wait is retained, not lost.
#[derive(Clone, Default)]
pub(crate) struct Wake(Arc<(Mutex<bool>, Condvar)>);
impl Wake {
    fn notify(&self) {
        let (pending, condition) = &*self.0;
        *pending.lock().unwrap() = true;
        condition.notify_one();
    }
    pub fn wait(&self, timeout: Duration) {
        let (pending, condition) = &*self.0;
        let pending = pending.lock().unwrap();
        let (mut pending, _) = condition
            .wait_timeout_while(pending, timeout, |ready| !*ready)
            .unwrap();
        *pending = false;
    }
}

pub(crate) struct Worker<T> {
    cancel: Cancellation,
    handle: Option<JoinHandle<()>>,
    result: mpsc::Receiver<Result<T, String>>,
}
impl<T: Send + 'static> Worker<T> {
    pub fn spawn(
        wake: &Wake,
        work: impl FnOnce(Cancellation) -> Result<T, String> + Send + 'static,
    ) -> Result<Self, String> {
        let cancel = Cancellation::default();
        let token = cancel.clone();
        let wake = wake.clone();
        let (sender, result) = mpsc::channel();
        let handle = thread::Builder::new()
            .name("fluentci-cache".into())
            .spawn(move || {
                let outcome = catch_unwind(AssertUnwindSafe(|| work(token)))
                    .unwrap_or_else(|_| Err("cache worker panicked".into()));
                // Make the result observable before waking the scheduler. Checking
                // JoinHandle::is_finished after an earlier wake would race thread exit.
                let _ = sender.send(outcome);
                wake.notify();
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            cancel,
            handle: Some(handle),
            result,
        })
    }
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    pub fn poll(&mut self) -> Option<Result<T, String>> {
        self.handle.as_ref()?;
        let result = match self.result.try_recv() {
            Ok(result) => result,
            Err(mpsc::TryRecvError::Empty) => return None,
            Err(mpsc::TryRecvError::Disconnected) => Err("cache worker disconnected".into()),
        };
        // Only notification and thread exit follow result publication; no cache I/O.
        let joined = self.handle.take().unwrap().join();
        Some(if joined.is_err() {
            Err("cache worker panicked".into())
        } else {
            result
        })
    }
}
impl<T> Drop for Worker<T> {
    fn drop(&mut self) {
        if let Some(handle) = self.handle.take() {
            self.cancel.cancel();
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    #[test]
    fn pending_work_does_not_block_poll_and_drop_joins_after_cancellation() {
        let (started_tx, started_rx) = mpsc::channel();
        let (ended_tx, ended_rx) = mpsc::channel();
        let mut worker = Worker::spawn(&Wake::default(), move |cancel| {
            started_tx.send(()).unwrap();
            while !cancel.is_cancelled() {
                thread::yield_now();
            }
            ended_tx.send(()).unwrap();
            Ok(())
        })
        .unwrap();
        started_rx
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        assert!(worker.poll().is_none());
        drop(worker);
        ended_rx.try_recv().unwrap();
    }
    #[test]
    fn wake_retains_notifications_before_wait_and_wakes_a_waiter() {
        let wake = Wake::default();
        wake.notify();
        // The stored notification is consumed even with a zero timeout.
        assert!(*wake.0 .0.lock().unwrap());
        wake.wait(Duration::ZERO);
        assert!(!*wake.0 .0.lock().unwrap());
        let other = wake.clone();
        let (done, completion) = mpsc::channel();
        let waiter = thread::spawn(move || {
            other.wait(Duration::from_secs(5));
            done.send(()).unwrap();
        });
        wake.notify();
        completion.recv_timeout(Duration::from_secs(2)).unwrap();
        waiter.join().unwrap();
    }

    #[test]
    fn completion_and_panics_publish_results_before_waking() {
        for panic in [false, true] {
            let wake = Wake::default();
            let mut worker = Worker::spawn(&wake, move |_| {
                assert!(!panic, "intentional worker panic");
                Ok(42)
            })
            .unwrap();
            wake.wait(Duration::from_secs(2));
            let result = worker
                .poll()
                .expect("notification must imply an observable result");
            if panic {
                assert!(result.unwrap_err().contains("panicked"));
            } else {
                assert_eq!(result.unwrap(), 42);
            }
            assert!(worker.poll().is_none());
        }
    }
    #[test]
    fn coalesced_notifications_preserve_all_worker_results() {
        let wake = Wake::default();
        let barrier = Arc::new(std::sync::Barrier::new(9));
        let mut workers: Vec<_> = (0..8)
            .map(|index| {
                let barrier = barrier.clone();
                Worker::spawn(&wake, move |_| {
                    barrier.wait();
                    Ok(index)
                })
                .unwrap()
            })
            .collect();
        barrier.wait();
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        let mut received = std::collections::HashSet::new();
        while received.len() != workers.len() {
            assert!(std::time::Instant::now() < deadline);
            wake.wait(Duration::from_millis(100));
            for worker in &mut workers {
                if let Some(value) = worker.poll() {
                    assert!(received.insert(value.unwrap()));
                }
            }
        }
    }
}
