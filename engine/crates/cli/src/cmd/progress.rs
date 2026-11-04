use fluentci_executor::{
    events::{Event, EventKind},
    Plan, Status,
};
use std::{
    collections::{BTreeMap, VecDeque},
    fs::File,
    io::{self, IsTerminal, Read, Seek, SeekFrom, Write},
    path::Path,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Plain,
    Tui,
    Json,
}
struct Row {
    number: usize,
    status: Status,
    cache: String,
    wait_reason: Option<String>,
    error: Option<String>,
    exit_code: Option<i32>,
    duration_ms: u128,
    started_ms: Option<u128>,
}

impl Row {
    fn pending(number: usize) -> Self {
        Self {
            number,
            status: Status::Pending,
            cache: "disabled".into(),
            wait_reason: None,
            error: None,
            exit_code: None,
            duration_ms: 0,
            started_ms: None,
        }
    }
}

/// One renderer for the whole execution; never one terminal per command.
pub struct Progress {
    mode: Mode,
    rows: BTreeMap<String, Row>,
    order: Vec<String>,
    tail: VecDeque<String>,
    offset: u64,
    pending: Vec<u8>,
    rendered_lines: usize,
    elapsed_ms: u128,
    observed: Instant,
    finished: Option<bool>,
    task_count: usize,
    remote_status: Option<String>,
    caught_up: bool,
    read_limit: Option<u64>,
    next_sequence: u64,
    #[cfg(unix)]
    identity: Option<(u64, u64)>,
    last_render: Instant,
    dirty: bool,
}
impl Progress {
    pub fn new(plan: &Plan, mode: &str) -> Result<Self, String> {
        Self::with_ids(
            plan.tasks.iter().map(|task| task.id.clone()).collect(),
            mode,
        )
    }
    pub fn replay(mode: &str) -> Result<Self, String> {
        Self::with_ids(Vec::new(), mode)
    }
    fn with_ids(ids: Vec<String>, mode: &str) -> Result<Self, String> {
        let terminal =
            io::stdout().is_terminal() && std::env::var("TERM").unwrap_or_default() != "dumb";
        let mode =
            match mode {
                "auto" if terminal => Mode::Tui,
                "auto" | "plain" => Mode::Plain,
                "json" => Mode::Json,
                "tui" if terminal => Mode::Tui,
                "tui" => return Err(
                    "TUI progress requires an interactive terminal; use --progress plain or json"
                        .into(),
                ),
                _ => return Err("progress must be auto, plain, tui, or json".into()),
            };
        if mode == Mode::Tui {
            write!(io::stdout().lock(), "\x1b[?25l").map_err(|e| e.to_string())?;
            io::stdout().flush().map_err(|e| e.to_string())?;
        }
        Ok(Self {
            mode,
            rows: ids
                .iter()
                .enumerate()
                .map(|(i, id)| (id.clone(), Row::pending(i + 1)))
                .collect(),
            task_count: ids.len(),
            remote_status: None,
            order: ids,
            tail: VecDeque::new(),
            offset: 0,
            pending: Vec::new(),
            rendered_lines: 0,
            elapsed_ms: 0,
            observed: Instant::now(),
            finished: None,
            caught_up: false,
            read_limit: None,
            next_sequence: 0,
            #[cfg(unix)]
            identity: None,
            last_render: Instant::now() - Duration::from_secs(1),
            dirty: true,
        })
    }
    pub fn poll(&mut self, path: &Path, final_read: bool) -> Result<(), String> {
        match std::fs::symlink_metadata(path) {
            Ok(metadata) if !metadata.is_file() => {
                return Err("execution journal must be a regular file".into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        match File::open(path) {
            Ok(mut file) => {
                let metadata = file.metadata().map_err(|e| e.to_string())?;
                if metadata.len() < self.offset
                    || self.read_limit.is_some_and(|end| metadata.len() < end)
                {
                    return Err("execution journal was truncated".into());
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    let identity = (metadata.dev(), metadata.ino());
                    if self.identity.is_some_and(|previous| previous != identity) {
                        return Err("execution journal was replaced".into());
                    }
                    self.identity = Some(identity);
                }
                let end = metadata.len().min(self.read_limit.unwrap_or(u64::MAX));
                file.seek(SeekFrom::Start(self.offset))
                    .map_err(|e| e.to_string())?;
                let mut buffer = [0u8; 65536];
                loop {
                    let amount =
                        (end.saturating_sub(self.offset)).min(buffer.len() as u64) as usize;
                    if amount == 0 {
                        break;
                    }
                    let n = file
                        .read(&mut buffer[..amount])
                        .map_err(|e| e.to_string())?;
                    if n == 0 {
                        return Err("execution journal was truncated during reading".into());
                    }
                    self.offset += n as u64;
                    self.pending.extend_from_slice(&buffer[..n]);
                    while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
                        if end + 1 > 4 * 1024 * 1024 {
                            return Err("execution event exceeds 4 MiB".into());
                        }
                        let line: Vec<_> = self.pending.drain(..=end).collect();
                        let event: Event = serde_json::from_slice(&line)
                            .map_err(|e| format!("invalid execution event: {e}"))?;
                        self.event(event)?;
                    }
                    if self.pending.len() > 4 * 1024 * 1024 {
                        return Err("execution event exceeds 4 MiB".into());
                    }
                    // Bound work per UI tick; the journal remains lossless on disk.
                    if !final_read {
                        break;
                    }
                }
                self.caught_up = self.offset >= end;
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound && self.offset == 0 => {
                self.caught_up = true
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Err("execution journal disappeared".into())
            }
            Err(e) => return Err(e.to_string()),
        }
        if self.mode == Mode::Tui
            && (final_read || self.last_render.elapsed() >= Duration::from_millis(100))
        {
            self.render()?;
        }
        Ok(())
    }
    pub fn caught_up(&self) -> bool {
        self.caught_up
    }
    pub fn completed(&self) -> Option<bool> {
        self.finished
    }
    pub fn limit(&mut self, end: u64) {
        self.read_limit = Some(end);
    }
    pub fn finish_display(&mut self) -> Result<(), String> {
        if self.mode == Mode::Tui {
            self.render()?;
        }
        Ok(())
    }
    pub fn ingest(&mut self, events: Vec<Event>) -> Result<(), String> {
        for event in events {
            self.event(event)?;
        }
        if self.mode == Mode::Tui && self.last_render.elapsed() >= Duration::from_millis(100) {
            self.render()?;
        }
        Ok(())
    }
    pub fn remote_state(&mut self, state: &str) -> Result<(), String> {
        if self.remote_status.as_deref() != Some(state) {
            self.remote_status = Some(state.into());
            self.dirty = true;
            if self.mode == Mode::Plain {
                writeln!(io::stdout().lock(), "[run] {state}").map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    fn event(&mut self, event: Event) -> Result<(), String> {
        if event.sequence != self.next_sequence || u128::from(event.elapsed_ms) < self.elapsed_ms {
            return Err("execution journal is not ordered".into());
        }
        self.next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or("execution sequence overflow")?;
        self.elapsed_ms = u128::from(event.elapsed_ms);
        self.observed = Instant::now();
        if let EventKind::RunFinished { success } = &event.kind {
            self.finished = Some(*success);
        }
        if self.mode == Mode::Json {
            let mut out = io::stdout().lock();
            serde_json::to_writer(&mut out, &event).map_err(|e| e.to_string())?;
            writeln!(out).map_err(|e| e.to_string())?;
            return Ok(());
        }
        match event.kind {
            EventKind::TaskState {
                id,
                status,
                cache,
                reason,
                wait_reason,
                error,
                exit_code,
                duration_ms,
                ..
            } => {
                if !self.rows.contains_key(&id) {
                    self.rows
                        .insert(id.clone(), Row::pending(self.order.len() + 1));
                    self.order.push(id.clone());
                }
                if let Some(row) = self.rows.get_mut(&id) {
                    if status == Status::Running && row.started_ms.is_none() {
                        row.started_ms = Some(u128::from(event.elapsed_ms));
                    }
                    row.status = status.clone();
                    row.cache = cache.clone();
                    row.wait_reason = wait_reason.clone();
                    row.error = error.clone();
                    row.exit_code = exit_code;
                    row.duration_ms = u128::from(duration_ms);
                }
                if self.mode == Mode::Plain {
                    writeln!(
                        io::stdout().lock(),
                        "[{}] {:?}{} cache={} {}",
                        clean(&id),
                        status,
                        exit_code
                            .map(|code| format!(" exit={code}"))
                            .unwrap_or_default(),
                        cache,
                        clean(
                            error
                                .as_deref()
                                .or(wait_reason.as_deref())
                                .unwrap_or(&reason)
                        )
                    )
                    .map_err(|e| e.to_string())?;
                } else if let Some(error) = error {
                    self.push_log(format!("{}: {}", id, error));
                }
            }
            EventKind::Log { id, stream, text } => {
                if self.mode == Mode::Plain {
                    for line in text.split_inclusive('\n') {
                        write!(
                            io::stdout().lock(),
                            "[{}:{}] {}",
                            clean(&id),
                            stream,
                            clean(line)
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    io::stdout().flush().map_err(|e| e.to_string())?;
                } else {
                    let prefix = self
                        .rows
                        .get(&id)
                        .map_or_else(|| id.clone(), |row| format!("#{} {id}", row.number));
                    for line in text.lines() {
                        self.push_log(format!(" => {prefix}:{stream} {line}"));
                    }
                }
            }
            EventKind::RunStarted { tasks } => {
                self.task_count = tasks;
                if self.mode == Mode::Plain {
                    writeln!(io::stdout().lock(), "Running {tasks} tasks")
                        .map_err(|e| e.to_string())?;
                }
            }
            EventKind::RunFinished { success } => {
                if self.mode == Mode::Plain {
                    writeln!(
                        io::stdout().lock(),
                        "Pipeline {}",
                        if success {
                            "succeeded"
                        } else {
                            "failed or cancelled"
                        }
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        self.dirty = true;
        Ok(())
    }
    fn push_log(&mut self, line: String) {
        self.tail
            .push_back(one_line(&line).chars().take(4096).collect());
        while self.tail.len() > 8 {
            self.tail.pop_front();
        }
    }
    fn render(&mut self) -> Result<(), String> {
        let running = self
            .rows
            .values()
            .any(|r| matches!(r.status, Status::Running | Status::Ready | Status::Stopping));
        if !self.dirty && !running {
            return Ok(());
        }
        let (width, height) = crossterm::terminal::size().unwrap_or((100, 30));
        let width = usize::from(width.saturating_sub(1)).max(1);
        let max_rows = usize::from(height.saturating_sub(12)).max(1);
        let elapsed = self.elapsed_ms
            + if self.finished.is_some() {
                0
            } else {
                self.observed.elapsed().as_millis()
            };
        let spinner = ['|', '/', '-', '\\'][(elapsed / 100 % 4) as usize];
        let complete = self
            .rows
            .values()
            .filter(|r| r.status == Status::Succeeded)
            .count();
        let hits = self.rows.values().filter(|r| r.cache == "hit").count();
        let failed = self
            .rows
            .values()
            .filter(|row| matches!(row.status, Status::Failed | Status::TimedOut))
            .count();
        let cancelled = self
            .rows
            .values()
            .filter(|row| row.status == Status::Cancelled)
            .count();
        let phase = match self.finished {
            Some(true) => "Finished",
            Some(false) => "Failed",
            None => match self.remote_status.as_deref() {
                Some("queued") => "Queued",
                Some("cancelled") => "Cancelled",
                Some("interrupted") => "Interrupted",
                Some("failed") => "Failed",
                _ => "Running",
            },
        };
        let mut lines = vec![format!(
            "[+] FluentCI {phase} {:.1}s  {complete}/{} succeeded  {hits} cached",
            elapsed as f64 / 1000.0,
            self.task_count.max(self.rows.len()),
        )];
        if failed > 0 || cancelled > 0 {
            lines[0].push_str(&format!("  {failed} failed  {cancelled} cancelled"));
        }
        if let Some(status) = &self.remote_status {
            lines[0].push_str(&format!(" [{status}]"));
        }
        // Keep failures and active tasks visible when the plan exceeds the terminal.
        let mut ids: Vec<_> = self.order.iter().collect();
        ids.sort_by_key(|id| visibility(&self.rows[*id].status));
        for id in ids.iter().take(max_rows) {
            let row = &self.rows[*id];
            let icon = match row.status {
                Status::Running | Status::Stopping => spinner,
                Status::Ready => '~',
                Status::Succeeded => '+',
                Status::Pending => '.',
                Status::Skipped => '-',
                _ => '!',
            };
            let duration = if matches!(
                row.status,
                Status::Running | Status::Ready | Status::Stopping
            ) {
                elapsed.saturating_sub(row.started_ms.unwrap_or(elapsed))
            } else {
                row.duration_ms
            };
            lines.push(format!(
                " => {icon} [#{:<2}] {:<24} {:<10?} {:>6.1}s {} {}",
                row.number,
                one_line(id).chars().take(24).collect::<String>(),
                row.status,
                duration as f64 / 1000.0,
                row.exit_code
                    .map(|code| format!("exit={code}"))
                    .unwrap_or_default(),
                one_line(row.error.as_deref().unwrap_or_else(|| {
                    if row.cache == "hit" {
                        "CACHED"
                    } else if row.cache == "preparing" {
                        "CACHE LOOKUP"
                    } else if row.cache == "storing" {
                        "CACHE SAVE"
                    } else {
                        row.wait_reason.as_deref().unwrap_or("")
                    }
                }))
            ));
        }
        if ids.len() > max_rows {
            lines.push(format!(
                " ... {} more tasks (all results retained in result.json)",
                ids.len() - max_rows
            ));
        }
        // Retain the actual process diagnostic independently of a rolling log
        // tail. Reserve existing output space for up to two failing jobs.
        for id in ids
            .iter()
            .copied()
            .filter(|id| matches!(self.rows[*id].status, Status::Failed | Status::TimedOut))
            .take(2)
        {
            let row = &self.rows[id];
            let code = row.exit_code.map_or_else(
                || "no process exit code".into(),
                |code| format!("exit code {code}"),
            );
            lines.push(format!("Failure {} ({code}):", one_line(id)));
            if let Some(error) = &row.error {
                let detail = error
                    .split_once("stderr:\n")
                    .or_else(|| error.split_once("stdout:\n"))
                    .map_or(error.as_str(), |(_, text)| text);
                let mut tail: Vec<_> = detail
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .rev()
                    .take(2)
                    .collect();
                tail.reverse();
                for line in tail {
                    let characters: Vec<_> = one_line(line).chars().collect();
                    for chunk in characters.chunks(width.saturating_sub(2).max(1)).take(2) {
                        lines.push(format!("  {}", chunk.iter().collect::<String>()));
                    }
                }
            }
        }
        lines.push("Recent output:".into());
        let available = usize::from(height.saturating_sub(1)).saturating_sub(lines.len());
        lines.extend(
            self.tail
                .iter()
                .skip(self.tail.len().saturating_sub(available))
                .cloned(),
        );
        lines.truncate(usize::from(height.saturating_sub(1)).max(1));
        let mut out = io::stdout().lock();
        if self.rendered_lines > 0 {
            write!(out, "\x1b[{}A", self.rendered_lines).map_err(|e| e.to_string())?;
        }
        write!(out, "\x1b[J").map_err(|e| e.to_string())?;
        for line in &lines {
            writeln!(out, "{}", line.chars().take(width).collect::<String>())
                .map_err(|e| e.to_string())?;
        }
        out.flush().map_err(|e| e.to_string())?;
        self.rendered_lines = lines.len();
        self.last_render = Instant::now();
        self.dirty = false;
        Ok(())
    }
}
impl Drop for Progress {
    fn drop(&mut self) {
        if self.mode == Mode::Tui {
            let _ = write!(io::stdout().lock(), "\x1b[?25h");
            let _ = io::stdout().flush();
        }
    }
}
fn visibility(status: &Status) -> u8 {
    match status {
        Status::Failed | Status::TimedOut => 0,
        Status::Running | Status::Ready | Status::Stopping => 1,
        Status::Cancelled => 2,
        Status::Pending => 3,
        Status::Skipped => 4,
        Status::Succeeded => 5,
    }
}
fn one_line(value: &str) -> String {
    clean(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn clean(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn task_rows_and_tail_entries_cannot_add_terminal_lines() {
        assert_eq!(one_line("task\nreason\tmore\x1b[2J"), "task reason more[2J");
        assert!(visibility(&Status::Failed) < visibility(&Status::Running));
        assert!(visibility(&Status::TimedOut) < visibility(&Status::Succeeded));
        assert_eq!(visibility(&Status::Ready), visibility(&Status::Running));
        assert_eq!(visibility(&Status::Stopping), visibility(&Status::Running));
    }
    #[test]
    fn terminal_control_sequences_cannot_be_injected_by_task_output() {
        assert_eq!(clean("hello\x1b[2J\r\x08world\n"), "hello[2Jworld\n");
    }
}
