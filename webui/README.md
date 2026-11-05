# FluentCI Studio

Studio is the local CI workspace embedded in the Rust FluentCI binary. React,
Tailwind CSS, Jotai, and TanStack Query share one origin with the Axum GraphQL
API and WebSocket event stream. No hosted account is required.

- One pipeline control: **Run** before the first execution, **Cancel** while
  queued/running, **Restart** after completion, failure, or cancellation.
- Collapsible steps with live elapsed times and ANSI terminal output.
- Hover or focus a job to reveal **Re-run job**. It starts a new run using that
  job's saved action, skips the other jobs, and preserves the original logs.
- Live log streaming automatically follows new output and the next active step.
  Scrolling upward, touching back through output, or inspecting a step pauses
  following; **Paused** resumes it. New runs start in Follow mode.
- Live log streaming with follow/pause scrolling, timestamps, instant filtering,
  match navigation, and full-run `.txt` downloads.
- Build-history bars with hover/focus tooltips and links to previous executions.
- **⌘K / Ctrl+K** opens quick search. Local commands filter immediately; SQLite
  FTS5 searches saved projects, runs, and logs after a 150 ms debounce. Log hits
  open the matching run, expand its step, and highlight the recorded line.
- Ordered action forms, local project settings, and exports for GitHub, GitLab,
  Azure, CircleCI, and AWS. Unsaved action drafts survive tab navigation.

Long outputs use TanStack Virtual. Logs are deduplicated by persistent IDs, and
reconnecting reloads saved output to recover messages missed while disconnected.
Polling provides a fallback when the event stream is unavailable.

## Build and run

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build:web
```

Build the CLI from the repository root with `cargo build --release --locked`,
then start Studio with `fluentci studio`.

For frontend development, start `cargo run --release -- server` from the
repository root and `bun run dev` here. Vite proxies `/graphql` and `/ws` to
127.0.0.1:6076. `VITE_APP_API_URL` and `VITE_APP_WS_URL` can override those
endpoints. Fonts are bundled, so Studio does not need a font CDN.

Use Node 22.22+ and Bun. The lockfile is committed; install with scripts disabled.

## Develop with mocks

```sh
bun run dev:mock
bun run storybook
```

MSW mocks both GraphQL and WebSocket events. Mock mode is opt-in and available
only in development; production builds always use the local server. The mock
preview streams sample test output. Append `?fixture=large` to the initial URL
to exercise a 10,000-line output. Storybook covers first-run, queued, running,
passed, failed, cancelled, empty-workspace, long-log, action, export, and quick
search scenarios.

## Validate

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run test:browser
bun run build-storybook
```

React Testing Library and MSW test real user interactions, mutations, streaming,
deduplication, reconnect recovery, search, downloads, and action drafts.
Playwright tests desktop and mobile Chromium, including virtualized long logs.
Its default `chrome` channel uses an installed Google Chrome.

The Rust search migration adds external-content FTS5 indexes and backfills
existing history. Triggers keep them in sync with project/run/log writes and
cascading deletions. Queries use bounded literal token prefixes, with optional
project scoping and a maximum of 100 results. Search does not index environment
variable values from saved actions.

See [the imported source notes](UPSTREAM.md) for provenance and licensing.
