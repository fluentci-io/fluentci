use anyhow::Result;
use futures_util::{Stream, stream};
use std::{
    collections::BTreeMap,
    future::Future,
    io::{self, IsTerminal, Write},
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

#[derive(Clone)]
pub(crate) struct Transfer {
    bytes: Arc<AtomicU64>,
    total: Arc<AtomicU64>,
}

impl Transfer {
    pub(crate) fn new(total: Option<u64>) -> Self {
        Self {
            bytes: Arc::new(AtomicU64::new(0)),
            total: Arc::new(AtomicU64::new(total.unwrap_or(u64::MAX))),
        }
    }

    pub(crate) fn set_total(&self, total: Option<u64>) {
        self.total
            .store(total.unwrap_or(u64::MAX), Ordering::Relaxed);
    }

    pub(crate) fn advance(&self, bytes: usize) {
        self.bytes.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    fn chunks(&self, bytes: Arc<[u8]>) -> impl Stream<Item = io::Result<Vec<u8>>> + Send + 'static {
        let transfer = self.clone();
        stream::unfold((bytes, 0), move |(bytes, offset)| {
            let transfer = transfer.clone();
            async move {
                if offset == bytes.len() {
                    return None;
                }
                let end = (offset + 64 * 1024).min(bytes.len());
                let chunk = bytes[offset..end].to_vec();
                transfer.advance(chunk.len());
                Some((Ok(chunk), (bytes, end)))
            }
        })
    }

    pub(crate) fn upload_body(&self, bytes: Arc<[u8]>) -> reqwest::Body {
        self.set_total(Some(bytes.len() as u64));
        reqwest::Body::wrap_stream(self.chunks(bytes))
    }

    pub(crate) fn reset(&self) {
        self.bytes.store(0, Ordering::Relaxed);
    }

    fn display(&self, frame: usize) -> String {
        let bytes = self.bytes.load(Ordering::Relaxed);
        let total = self.total.load(Ordering::Relaxed);
        if total == u64::MAX {
            let bar: String = (0..20)
                .map(|index| {
                    if (frame / 2) % 20 == index {
                        '━'
                    } else {
                        '─'
                    }
                })
                .collect();
            return format!("[{bar}] {}", size(bytes));
        }
        let fraction = if total == 0 {
            1.0
        } else {
            (bytes as f64 / total as f64).min(1.0)
        };
        let filled = (fraction * 20.0) as usize;
        format!(
            "[{}{}] {}/{} {:>3.0}%",
            "━".repeat(filled),
            "─".repeat(20 - filled),
            size(bytes),
            size(total),
            fraction * 100.0
        )
    }

    fn complete(&self) -> bool {
        let total = self.total.load(Ordering::Relaxed);
        total != u64::MAX && self.bytes.load(Ordering::Relaxed) >= total
    }
}

fn size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.1} MiB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.1} KiB", bytes as f64 / 1024.0)
    } else {
        format!("{bytes} B")
    }
}

fn terminal_columns() -> usize {
    #[cfg(unix)]
    {
        let mut size = std::mem::MaybeUninit::<libc::winsize>::zeroed();
        // ioctl initializes winsize on success; stderr is only queried in TTY mode.
        if unsafe { libc::ioctl(libc::STDERR_FILENO, libc::TIOCGWINSZ, size.as_mut_ptr()) } == 0 {
            return unsafe { size.assume_init() }.ws_col.max(1) as usize;
        }
    }
    80
}

#[derive(Default)]
struct Display {
    rows: BTreeMap<u64, String>,
    drawn: usize,
    next: u64,
}

fn display() -> &'static Mutex<Display> {
    static DISPLAY: OnceLock<Mutex<Display>> = OnceLock::new();
    DISPLAY.get_or_init(|| Mutex::new(Display::default()))
}

impl Display {
    fn redraw(&mut self) {
        let mut stderr = io::stderr().lock();
        if self.drawn > 0 {
            let _ = write!(stderr, "\x1b[{}A\r\x1b[J", self.drawn);
        }
        // Keep each row on one physical line, including narrow terminals.
        let columns = terminal_columns();
        for row in self.rows.values() {
            let row: String = row.chars().take(columns.saturating_sub(1)).collect();
            let _ = writeln!(stderr, "{row}");
        }
        self.drawn = self.rows.len();
        let _ = stderr.flush();
    }
}

struct Line<'a> {
    id: u64,
    message: &'a str,
    transfer: Option<(&'a Transfer, &'a str)>,
    frame: usize,
}

impl Line<'_> {
    fn tick(&mut self) {
        const FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        let message = match self.transfer {
            Some((transfer, finishing)) if transfer.complete() => finishing,
            _ => self.message,
        };
        let detail = self
            .transfer
            .map(|(transfer, _)| format!(" {}", transfer.display(self.frame)))
            .unwrap_or_default();
        let row = format!("{} {message}{detail}", FRAMES[self.frame % FRAMES.len()]);
        let mut display = display().lock().unwrap_or_else(|error| error.into_inner());
        display.rows.insert(self.id, row);
        display.redraw();
        self.frame = self.frame.wrapping_add(1);
    }
}

impl Drop for Line<'_> {
    fn drop(&mut self) {
        let mut display = display().lock().unwrap_or_else(|error| error.into_inner());
        display.rows.remove(&self.id);
        display.redraw();
    }
}

pub(crate) async fn with_progress<T>(
    message: &str,
    operation: impl Future<Output = Result<T>>,
) -> Result<T> {
    run(message, None, operation).await
}

pub(crate) async fn with_transfer<T>(
    message: &str,
    finishing: &str,
    transfer: &Transfer,
    operation: impl Future<Output = Result<T>>,
) -> Result<T> {
    run(message, Some((transfer, finishing)), operation).await
}

async fn run<T>(
    message: &str,
    transfer: Option<(&Transfer, &str)>,
    operation: impl Future<Output = Result<T>>,
) -> Result<T> {
    if !io::stderr().is_terminal() || std::env::var("TERM").as_deref() == Ok("dumb") {
        eprintln!("{message}…");
        return operation.await;
    }
    let id = {
        let mut display = display().lock().unwrap_or_else(|error| error.into_inner());
        display.next = display.next.wrapping_add(1);
        display.next
    };
    let mut line = Line {
        id,
        message,
        transfer,
        frame: 0,
    };
    let mut ticks = tokio::time::interval(Duration::from_millis(80));
    ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    tokio::pin!(operation);
    loop {
        tokio::select! {
            biased;
            result = &mut operation => return result,
            _ = ticks.tick() => line.tick(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    #[tokio::test]
    async fn streamed_upload_preserves_every_byte_and_tracks_consumption() -> Result<()> {
        let input: Vec<u8> = (0..(128 * 1024 + 17)).map(|i| (i % 251) as u8).collect();
        let progress = Transfer::new(Some(input.len() as u64));
        let chunks = progress.chunks(input.clone().into());
        tokio::pin!(chunks);
        assert_eq!(progress.bytes.load(Ordering::Relaxed), 0);
        let mut output = vec![];
        while let Some(chunk) = chunks.next().await {
            output.extend(chunk?);
            assert_eq!(progress.bytes.load(Ordering::Relaxed), output.len() as u64);
        }
        assert_eq!(output, input);
        assert!(progress.complete());
        assert!(progress.display(0).ends_with("100%"));
        Ok(())
    }
}
