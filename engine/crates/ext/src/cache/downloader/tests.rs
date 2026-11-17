use super::transfer;
use reqwest::Url;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::{JoinHandle, JoinSet},
};

#[derive(Clone, Copy)]
enum Mode {
    Range,
    Plain,
    Unknown,
    Weak,
    Changed,
    WrongRange,
    Ignored,
    Truncated,
    Missing,
    Empty,
    Slow,
}

struct Server {
    url: Url,
    task: JoinHandle<()>,
    requests: Arc<Mutex<Vec<String>>>,
    maximum: Arc<AtomicUsize>,
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn server(mode: Mode) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = Url::parse(&format!(
        "http://{}/archive",
        listener.local_addr().unwrap()
    ))
    .unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let active = Arc::new(AtomicUsize::new(0));
    let maximum = Arc::new(AtomicUsize::new(0));
    let (logged, running, peak) = (requests.clone(), active.clone(), maximum.clone());
    let task = tokio::spawn(async move {
        let mut connections = JoinSet::new();
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let (logged, running, peak) = (logged.clone(), running.clone(), peak.clone());
            connections.spawn(async move {
                respond(stream, mode, logged, running, peak).await;
            });
        }
    });
    Server {
        url,
        task,
        requests,
        maximum,
    }
}

async fn respond(
    mut stream: TcpStream,
    mode: Mode,
    requests: Arc<Mutex<Vec<String>>>,
    active: Arc<AtomicUsize>,
    maximum: Arc<AtomicUsize>,
) {
    let mut input = Vec::new();
    loop {
        let mut buffer = [0; 1024];
        let count = stream.read(&mut buffer).await.unwrap();
        if count == 0 {
            return;
        }
        input.extend_from_slice(&buffer[..count]);
        if input.windows(4).any(|value| value == b"\r\n\r\n") {
            break;
        }
        assert!(input.len() < 16384);
    }
    let request = String::from_utf8(input).unwrap();
    requests.lock().unwrap().push(request.clone());
    let range = request
        .lines()
        .find_map(|line| line.strip_prefix("range: bytes="))
        .map(|value| {
            let (start, end) = value.split_once('-').unwrap();
            (
                start.parse::<usize>().unwrap(),
                end.parse::<usize>().unwrap(),
            )
        });
    let data: Vec<u8> = (0..128).collect();
    let mut body = data.clone();
    let mut status = "200 OK";
    let mut headers = String::new();
    let worker = range.is_some_and(|value| value != (0, 0));
    if worker {
        let count = active.fetch_add(1, Ordering::SeqCst) + 1;
        maximum.fetch_max(count, Ordering::SeqCst);
        tokio::time::sleep(std::time::Duration::from_millis(
            if matches!(mode, Mode::Slow) { 5000 } else { 20 },
        ))
        .await;
    }
    if matches!(mode, Mode::Missing) {
        status = "404 Not Found";
        body.clear();
    } else if matches!(mode, Mode::Empty) {
        status = "416 Range Not Satisfiable";
        body.clear();
        headers.push_str("Content-Range: bytes */0\r\n");
    } else if let Some((start, end)) = range.filter(|_| {
        !matches!(mode, Mode::Plain | Mode::Unknown) && !(worker && matches!(mode, Mode::Ignored))
    }) {
        status = "206 Partial Content";
        body = data[start..=end].to_vec();
        let header_start = if worker && matches!(mode, Mode::WrongRange) {
            start + 1
        } else {
            start
        };
        let etag = if worker && matches!(mode, Mode::Changed) {
            "\"v2\""
        } else if matches!(mode, Mode::Weak) {
            "W/\"v1\""
        } else {
            "\"v1\""
        };
        headers = format!("Content-Range: bytes {header_start}-{end}/128\r\nETag: {etag}\r\n");
        if worker {
            assert!(request.contains("if-match: \"v1\""));
        }
    }
    if !matches!(mode, Mode::Unknown) {
        headers.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    if worker && matches!(mode, Mode::Truncated) {
        body.truncate(body.len() / 2);
    }
    let head = format!("HTTP/1.1 {status}\r\n{headers}Connection: close\r\n\r\n");
    let _ = stream.write_all(head.as_bytes()).await;
    let _ = stream.write_all(&body).await;
    if worker {
        active.fetch_sub(1, Ordering::SeqCst);
    }
}

#[tokio::test]
async fn parallel_ranges_are_bounded_and_publish_exact_bytes() {
    let fixture = server(Mode::Range).await;
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.tar.gz");
    assert!(transfer(fixture.url.clone(), &path, 3, 8).await.unwrap());
    assert_eq!(std::fs::read(path).unwrap(), (0u8..128).collect::<Vec<_>>());
    assert!((2..=3).contains(&fixture.maximum.load(Ordering::SeqCst)));
}

#[tokio::test]
async fn sequential_fallback_handles_no_ranges_weak_etags_and_unknown_lengths() {
    for mode in [Mode::Plain, Mode::Unknown, Mode::Weak] {
        let fixture = server(mode).await;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("archive");
        assert!(transfer(fixture.url.clone(), &path, 4, 8).await.unwrap());
        assert_eq!(std::fs::read(path).unwrap(), (0u8..128).collect::<Vec<_>>());
        assert_eq!(fixture.maximum.load(Ordering::SeqCst), 0);
    }
}

#[tokio::test]
async fn changed_malformed_ignored_and_truncated_ranges_never_publish() {
    for mode in [
        Mode::Changed,
        Mode::WrongRange,
        Mode::Ignored,
        Mode::Truncated,
    ] {
        let fixture = server(mode).await;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("archive");
        assert!(transfer(fixture.url.clone(), &path, 4, 8).await.is_err());
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 0);
    }
}

#[tokio::test]
async fn misses_empty_objects_existing_files_and_cancellation_are_safe() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("archive");
    let missing = server(Mode::Missing).await;
    assert!(!transfer(missing.url.clone(), &path, 4, 8).await.unwrap());
    assert!(!path.exists());
    let empty = server(Mode::Empty).await;
    assert!(transfer(empty.url.clone(), &path, 4, 8).await.unwrap());
    assert!(std::fs::read(&path).unwrap().is_empty());
    let full = server(Mode::Range).await;
    assert!(transfer(full.url.clone(), &path, 4, 8).await.unwrap());
    assert!(
        std::fs::read(&path).unwrap().is_empty(),
        "Existing cache must not be overwritten"
    );
    let cancelled_path = directory.path().join("cancelled");
    let slow = server(Mode::Slow).await;
    assert!(tokio::time::timeout(
        std::time::Duration::from_millis(100),
        transfer(slow.url.clone(), &cancelled_path, 4, 8)
    )
    .await
    .is_err());
    assert!(!cancelled_path.exists());
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    assert!(missing.requests.lock().unwrap().len() == 1);
}
