//! Connect host shutdown signals to an executor cancellation token.
use fluentci_executor::Cancellation;

pub struct CancellationSignals(tokio::task::JoinHandle<()>);
impl CancellationSignals {
    pub fn new(cancel: Cancellation) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            let mut interrupt =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
            Ok(Self(tokio::spawn(async move {
                tokio::select! { _ = interrupt.recv() => {}, _ = terminate.recv() => {} }
                cancel.cancel();
            })))
        }
        #[cfg(not(unix))]
        {
            Ok(Self(tokio::spawn(async move {
                if tokio::signal::ctrl_c().await.is_ok() {
                    cancel.cancel();
                }
            })))
        }
    }
}
impl Drop for CancellationSignals {
    fn drop(&mut self) {
        self.0.abort();
    }
}
