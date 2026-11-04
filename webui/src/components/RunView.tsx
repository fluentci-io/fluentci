import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom } from "jotai";
import { useSearchParams } from "react-router-dom";
import {
  IconArrowDown as ArrowDown,
  IconArrowUp as ArrowUp,
  IconChevronDown as ChevronDown,
  IconArrowsMinimize as ChevronsDownUp,
  IconArrowsMaximize as ChevronsUpDown,
  IconClock as Clock3,
  IconDownload as Download,
  IconGitBranch as GitBranch,
  IconHash as Hash,
  IconPlayerPause as Pause,
  IconBroadcast as Radio,
  IconSearch as Search,
  IconTerminal2 as Terminal,
  IconX as X,
} from "@tabler/icons-react";
import Ansi from "ansi-to-react";
import { PipelineSpans } from "./PipelineSpans";
import { graphql, isActive, mergeLogs } from "../api";
import { followLogsAtom, logSearchAtom, timestampsAtom } from "../state";
import type { Job, Log, Run } from "../types";
import {
  date,
  download,
  duration,
  Empty,
  ErrorNotice,
  StatusBadge,
  StatusIcon,
  statusLabel,
  useNow,
} from "./ui";

export function plainText(text: string) {
  // Strip ANSI control sequences for predictable searching and plain-text exports.
  /* eslint-disable no-control-regex -- ANSI escape and OSC sequences are control characters by definition. */
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
  /* eslint-enable no-control-regex */
}

export function exportLogs(run: Run, logs: Map<string, Log[]>) {
  return [
    `FluentCI Studio · ${run.title}`,
    `Run: ${run.id}`,
    `Status: ${statusLabel(run.status)}`,
    `Started: ${run.date}`,
    `Duration: ${duration(run.duration)}`,
    "",
    ...run.jobs.flatMap((job) => [
      `── ${job.name} · ${statusLabel(job.status)} · ${duration(job.duration || 0)} ──`,
      ...(logs.get(job.id) || []).map(
        (log) => `[${log.createdAt}] ${plainText(log.message)}`,
      ),
      "",
    ]),
  ].join("\n");
}

function Highlight({ text, search }: { text: string; search: string }) {
  if (!search) return <Ansi linkify={false}>{text}</Ansi>;
  const clean = plainText(text);
  const lower = clean.toLowerCase();
  const needle = search.toLowerCase();
  const parts = [];
  let offset = 0;
  let match = lower.indexOf(needle);
  while (match !== -1) {
    parts.push(
      clean.slice(offset, match),
      <mark key={match} className="rounded-sm bg-warning/25 text-warning">
        {clean.slice(match, match + needle.length)}
      </mark>,
    );
    offset = match + needle.length;
    match = lower.indexOf(needle, offset);
  }
  parts.push(clean.slice(offset));
  return <>{parts}</>;
}

export function Step({
  job,
  logs,
  search = "",
  open,
  onToggle,
  timestamps,
  focusedLogId,
  logError,
  now,
}: {
  job: Job;
  logs: Log[];
  search?: string;
  open: boolean;
  onToggle: () => void;
  timestamps: boolean;
  focusedLogId?: string;
  logError?: unknown;
  now: number;
}) {
  const elapsed =
    job.status === "RUNNING" && job.startedAt
      ? now - new Date(job.startedAt).getTime()
      : job.duration;
  const lines = useMemo(
    () =>
      search
        ? logs.filter((log) =>
            plainText(log.message).toLowerCase().includes(search.toLowerCase()),
          )
        : logs,
    [logs, search],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useAtom(followLogsAtom);
  const virtual = lines.length > 300;
  const virtualizer = useVirtualizer({
    count: virtual ? lines.length : 0,
    getScrollElement: () => viewport.current,
    estimateSize: () => 24,
    overscan: 12,
    enabled: virtual && open,
    initialRect: { width: 800, height: 460 },
  });
  const numbers = useMemo(
    () => new Map(logs.map((log, index) => [log.id, index + 1])),
    [logs],
  );
  useEffect(() => {
    if (follow && !search && open && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [logs.length, follow, search, open]);
  useEffect(() => {
    if (!focusedLogId || !open) return;
    const index = lines.findIndex((line) => line.id === focusedLogId);
    if (virtual && index !== -1)
      virtualizer.scrollToIndex(index, { align: "center" });
    else
      document
        .getElementById(`line-${focusedLogId}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedLogId, open, logs.length, lines, virtual, virtualizer]);
  const renderLine = (index: number, offset?: number) => {
    const log = lines[index];
    return (
      <div
        key={log.id}
        id={`line-${log.id}`}
        style={
          offset === undefined
            ? undefined
            : {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: 24,
                transform: `translateY(${offset}px)`,
              }
        }
        className={`flex min-w-max px-4 ${log.id === focusedLogId ? "bg-warning/10 ring-1 ring-inset ring-warning/30" : "hover:bg-white/[0.025]"}`}
      >
        <span className="mr-4 w-8 shrink-0 select-none text-right text-muted/45">
          {numbers.get(log.id)}
        </span>
        {timestamps && (
          <time className="mr-4 shrink-0 text-muted" dateTime={log.createdAt}>
            {new Date(log.createdAt).toLocaleTimeString([], { hour12: false })}
          </time>
        )}
        <pre className="m-0 whitespace-pre pr-6 text-log">
          <Highlight text={log.message} search={search} />
        </pre>
      </div>
    );
  };
  return (
    <section
      className={`overflow-hidden rounded-lg border ${job.status === "RUNNING" ? "border-accent/35" : job.status === "FAILURE" ? "border-danger/30" : "border-line"}`}
    >
      <button
        className="flex w-full items-center gap-3 bg-panel px-4 py-3.5 text-left transition-colors hover:bg-elevated"
        aria-expanded={open}
        aria-controls={`step-${job.id}`}
        onClick={onToggle}
      >
        <ChevronDown
          size={15}
          className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <StatusIcon status={job.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {job.name}
        </span>
        {search && (
          <span className="text-xs text-muted">
            {lines.length} matching lines
          </span>
        )}
        <span className="hidden text-xs text-muted sm:inline">
          {statusLabel(job.status)}
        </span>
        <span className="min-w-14 text-right font-mono text-xs text-muted">
          {elapsed != null ? duration(elapsed) : "—"}
        </span>
      </button>
      {open && (
        <div id={`step-${job.id}`}>
          {logError ? (
            <div className="px-4">
              <ErrorNotice error={logError} />
            </div>
          ) : (
            <div
              ref={viewport}
              className="max-h-[460px] overflow-auto bg-terminal py-3 font-mono text-xs leading-6"
              onWheel={(event) => {
                if (event.deltaY < 0) setFollow(false);
              }}
              aria-label={`${job.name} output`}
              tabIndex={0}
              onScroll={(event) => {
                const element = event.currentTarget;
                if (
                  follow &&
                  element.scrollHeight -
                    element.clientHeight -
                    element.scrollTop >
                    48
                )
                  setFollow(false);
              }}
            >
              {lines.length ? (
                virtual ? (
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      position: "relative",
                    }}
                  >
                    {virtualizer
                      .getVirtualItems()
                      .map((row) => renderLine(row.index, row.start))}
                  </div>
                ) : (
                  lines.map((_, index) => renderLine(index))
                )
              ) : (
                <p className="px-5 text-muted">
                  {search
                    ? "No matching output in this step."
                    : job.status === "PENDING"
                      ? "Waiting for this step to start…"
                      : job.status === "SKIPPED"
                        ? "This step was skipped."
                        : isActive(job.status)
                          ? "Waiting for output…"
                          : "No output recorded."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function RunView({ run }: { run: Run | null | undefined }) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "spans" ? "spans" : "steps";
  const setView = (value: "steps" | "spans") => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === "spans") next.set("view", value);
        else next.delete("view");
        return next;
      },
      { replace: true },
    );
  };
  const focusJob = params.get("job");
  const focusLog = params.get("log");
  const now = useNow();
  const [search, setSearch] = useAtom(logSearchAtom);
  const [follow, setFollow] = useAtom(followLogsAtom);
  const [timestamps, setTimestamps] = useAtom(timestampsAtom);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [matchIndex, setMatchIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const jobs = run?.jobs || [];
  const results = useQueries({
    queries: jobs.map((job) => ({
      queryKey: ["logs", job.id],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { logs } = await graphql<{ logs: Log[] }>(
          "query($id: ID!) { logs(jobId: $id) { id jobId message createdAt } }",
          { id: job.id },
          signal,
        );
        return mergeLogs(
          logs,
          client.getQueryData<Log[]>(["logs", job.id]) || [],
        );
      },
      refetchInterval: isActive(run?.status) ? 5_000 : (false as const),
    })),
  });
  const logs = new Map(
    jobs.map((job, index) => [job.id, results[index].data || []]),
  );
  const matches = jobs.flatMap((job) =>
    (logs.get(job.id) || [])
      .filter(
        (log) =>
          search &&
          plainText(log.message).toLowerCase().includes(search.toLowerCase()),
      )
      .map((log) => ({ jobId: job.id, logId: log.id })),
  );
  const selectedMatch = matches.length
    ? matches[matchIndex % matches.length]
    : undefined;
  const totalLines = results.reduce(
    (total, result) => total + (result.data?.length || 0),
    0,
  );
  useEffect(() => {
    setExpanded(focusJob ? { [focusJob]: true } : {});
    setMatchIndex(0);
    setSearch("");
  }, [run?.id, focusJob, focusLog, setSearch]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        )
      ) {
        event.preventDefault();
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            next.delete("view");
            return next;
          },
          { replace: true },
        );
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setParams]);
  const active = isActive(run?.status);
  const completed = jobs.filter((job) =>
    ["SUCCESS", "FAILURE", "SKIPPED", "CANCELLED"].includes(job.status),
  ).length;
  // The start timestamp is stable even while logs are streaming.
  const elapsed =
    active && run ? now - new Date(run.date).getTime() : run?.duration || 0;
  const formattedStart = useMemo(() => (run ? date(run.date) : ""), [run]);
  if (!run)
    return (
      <Empty icon={<Terminal size={30} />} title="Ready when you are">
        <p>
          Run your pipeline to see each step, execution time, and live output
          here.
        </p>
        <p className="mt-3 font-mono text-xs">
          Local execution. Full visibility.
        </p>
      </Empty>
    );
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          <h2 className="text-sm font-medium">Execution details</h2>
          <span className="font-mono text-xs text-muted">
            {run.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Clock3 size={13} />
            {duration(elapsed)}
          </span>
          <span>{formattedStart}</span>
          {run.branch && (
            <span className="flex items-center gap-1">
              <GitBranch size={13} />
              {run.branch}
            </span>
          )}
          {run.commit && (
            <span className="flex items-center gap-1 font-mono">
              <Hash size={13} />
              {run.commit.slice(0, 7)}
            </span>
          )}
        </div>
      </div>
      {run.message && <ErrorNotice error={run.message} />}
      {!!exportError && <ErrorNotice error={exportError} />}
      <div
        className="mb-3 inline-flex gap-1 rounded-lg border border-line bg-panel p-1"
        role="group"
        aria-label="Execution view"
      >
        {(["steps", "spans"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            className={`rounded-md px-3 py-1.5 text-xs capitalize ${view === value ? "bg-accent/20 text-accent" : "text-muted hover:bg-elevated"}`}
            onClick={() => setView(value)}
          >
            {value === "steps" ? "Steps & logs" : "Spans"}
          </button>
        ))}
      </div>
      {view === "spans" && (
        <PipelineSpans
          run={run}
          now={now}
          onSelect={(job) => {
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                next.delete("view");
                next.delete("log");
                next.set("job", job.id);
                return next;
              },
              { replace: true },
            );
            setExpanded((old) => ({ ...old, [job.id]: true }));
            setSearch("");
          }}
        />
      )}
      <div hidden={view === "spans"}>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <div className="relative flex min-w-40 flex-1 items-center gap-2 pl-2">
            <Search size={15} className="shrink-0 text-muted" />
            <input
              ref={searchRef}
              aria-label="Search logs"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
                if (event.key === "Enter" && matches.length)
                  setMatchIndex(
                    (index) =>
                      index + (event.shiftKey ? matches.length - 1 : 1),
                  );
              }}
              placeholder="Search all logs…"
              className="w-full bg-transparent py-1.5 text-xs outline-none placeholder:text-muted"
            />
            {search && (
              <>
                <span className="shrink-0 text-xs text-muted" role="status">
                  {matches.length
                    ? `${(matchIndex % matches.length) + 1}/${matches.length}`
                    : "No matches"}
                </span>
                <button
                  className="icon-btn"
                  aria-label="Previous match"
                  disabled={!matches.length}
                  onClick={() =>
                    setMatchIndex((index) => index + matches.length - 1)
                  }
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Next match"
                  disabled={!matches.length}
                  onClick={() => setMatchIndex((index) => index + 1)}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Clear log search"
                  onClick={() => setSearch("")}
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <button
            className={`toolbar-btn ${follow ? "text-accent" : ""}`}
            aria-pressed={follow}
            onClick={() => setFollow((value) => !value)}
          >
            {follow ? <Radio size={14} /> : <Pause size={14} />}
            <span>{follow ? "Following" : "Paused"}</span>
          </button>
          <button
            className={`toolbar-btn ${timestamps ? "text-accent" : ""}`}
            aria-label="Toggle timestamps"
            aria-pressed={timestamps}
            onClick={() => setTimestamps((value) => !value)}
          >
            <Clock3 size={14} />
          </button>
          <button
            className="toolbar-btn"
            aria-label="Expand all steps"
            onClick={() =>
              setExpanded(Object.fromEntries(jobs.map((job) => [job.id, true])))
            }
          >
            <ChevronsUpDown size={14} />
          </button>
          <button
            className="toolbar-btn"
            aria-label="Collapse all steps"
            onClick={() =>
              setExpanded(
                Object.fromEntries(jobs.map((job) => [job.id, false])),
              )
            }
          >
            <ChevronsDownUp size={14} />
          </button>
          <button
            className="toolbar-btn"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              setExportError(null);
              try {
                const entries = await Promise.all(
                  jobs.map(async (job) => {
                    const { logs: saved } = await graphql<{ logs: Log[] }>(
                      "query($id: ID!) { logs(jobId: $id) { id jobId message createdAt } }",
                      { id: job.id },
                    );
                    return [
                      job.id,
                      mergeLogs(
                        saved,
                        client.getQueryData<Log[]>(["logs", job.id]) || [],
                      ),
                    ] as const;
                  }),
                );
                download(
                  `fluentci-${run.id.slice(0, 8)}.txt`,
                  exportLogs(run, new Map(entries)),
                );
              } catch (error) {
                setExportError(error);
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download size={14} />
            <span>{exporting ? "Exporting…" : "Download logs"}</span>
          </button>
        </div>
        <div className="space-y-2.5">
          {jobs.map((job, index) => {
            const defaultOpen =
              job.status === "RUNNING" || job.status === "FAILURE";
            const open = search
              ? (logs.get(job.id) || []).some((log) =>
                  plainText(log.message)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
              : (expanded[job.id] ?? defaultOpen);
            return (
              <Step
                key={job.id}
                job={job}
                logs={logs.get(job.id) || []}
                search={search}
                open={open}
                onToggle={() => {
                  if (search) setSearch("");
                  setExpanded((old) => ({ ...old, [job.id]: !open }));
                }}
                timestamps={timestamps}
                focusedLogId={
                  selectedMatch?.jobId === job.id
                    ? selectedMatch.logId
                    : !search && focusJob === job.id
                      ? focusLog || undefined
                      : undefined
                }
                logError={results[index].error}
                now={now}
              />
            );
          })}
        </div>
        {!jobs.length && (
          <Empty icon={<Terminal size={24} />} title="No steps recorded">
            This run has no recorded steps.
          </Empty>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-muted">
        <span>
          {completed} of {jobs.length} steps finished{" "}
          <span className="mx-2 text-line">/</span>{" "}
          {totalLines.toLocaleString()} log lines
        </span>
        <span className="flex items-center gap-1.5">
          {active && (
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
          )}
          {active ? "Streaming output" : "Execution finished"}
        </span>
      </div>
    </div>
  );
}
