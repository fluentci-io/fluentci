//! SuperConsole adapter with explicit TTY detection and a plain-log fallback.
use std::{
    collections::VecDeque,
    convert::Infallible,
    env,
    io::{self, IsTerminal},
    time::Instant,
};

use superconsole::{Component, Dimensions, DrawMode, Line, Lines, SuperConsole};

pub(crate) struct Console {
    renderer: Option<SuperConsole>,
    command: String,
    lines: VecDeque<String>,
    started: Instant,
}

impl Console {
    pub(crate) fn new(command: &str) -> Option<Self> {
        if !enabled(
            io::stderr().is_terminal(),
            &env::var("TERM").unwrap_or_default(),
            &env::var("FLUENTCI_CONSOLE").unwrap_or_default(),
        ) {
            return None;
        }
        Some(Self {
            renderer: Some(SuperConsole::new()?),
            command: command.into(),
            lines: VecDeque::new(),
            started: Instant::now(),
        })
    }

    pub(crate) fn line(&mut self, line: &str) -> io::Result<()> {
        self.lines.push_back(line.into());
        while self.lines.len() > 20 {
            self.lines.pop_front();
        }
        let view = Log {
            command: &self.command,
            lines: &self.lines,
            elapsed: self.started.elapsed().as_secs_f64(),
        };
        if let Some(renderer) = &mut self.renderer {
            renderer
                .render(&view)
                .map_err(|error| io::Error::other(error.to_string()))?;
        }
        Ok(())
    }

    pub(crate) fn finish(&mut self) -> io::Result<()> {
        if let Some(renderer) = self.renderer.take() {
            renderer
                .finalize(&Log {
                    command: &self.command,
                    lines: &self.lines,
                    elapsed: self.started.elapsed().as_secs_f64(),
                })
                .map_err(|error| io::Error::other(error.to_string()))?;
        }
        Ok(())
    }
}

fn clean(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect()
}

fn enabled(terminal: bool, term: &str, console: &str) -> bool {
    terminal && term != "dumb" && console != "0"
}

struct Log<'a> {
    command: &'a str,
    lines: &'a VecDeque<String>,
    elapsed: f64,
}

impl Component for Log<'_> {
    type Error = Infallible;

    fn draw_unchecked(&self, dimensions: Dimensions, mode: DrawMode) -> Result<Lines, Infallible> {
        let mut lines: Vec<Line> = if mode == DrawMode::Normal {
            self.lines
                .iter()
                .skip(
                    self.lines
                        .len()
                        .saturating_sub(dimensions.height.saturating_sub(1)),
                )
                .map(|line| Line::sanitized(&clean(line)))
                .collect()
        } else {
            Vec::new()
        };
        lines.push(Line::sanitized(&clean(&format!(
            "   {} {} in {:.1}s",
            if mode == DrawMode::Final {
                "Finished"
            } else {
                "Executing"
            },
            self.command,
            self.elapsed
        ))));
        Ok(Lines(lines))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tty_detection_respects_pipes_dumb_terminals_and_explicit_opt_out() {
        assert!(enabled(true, "xterm-256color", ""));
        assert!(!enabled(false, "xterm-256color", "1"));
        assert!(!enabled(true, "dumb", "1"));
        assert!(!enabled(true, "xterm-256color", "0"));
    }

    #[test]
    fn superconsole_bounds_log_tail_and_sanitizes_child_control_characters() {
        let logs = VecDeque::from(["first".into(), "second\n\x1b[2J".into()]);
        let view = Log {
            command: "printf test",
            lines: &logs,
            elapsed: 1.0,
        };
        let frame = view.draw(Dimensions::new(24, 2), DrawMode::Normal).unwrap();
        assert_eq!(frame.len(), 2);
        assert_eq!(frame.0[0].to_unstyled(), "second  [2J");
        let final_frame = view.draw(Dimensions::new(24, 2), DrawMode::Final).unwrap();
        assert_eq!(final_frame.len(), 1);
    }
}
