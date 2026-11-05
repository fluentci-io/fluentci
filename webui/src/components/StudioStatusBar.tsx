import {
  IconActivity,
  IconClock,
  IconCommand,
  IconFolder,
  IconGitBranch,
  IconSearch,
  IconTerminal2,
} from "@tabler/icons-react";
import { isActive, useRun } from "../api";
import type { Project, Run } from "../types";
import { duration, StatusIcon, statusLabel, useNow } from "./ui";

export function StudioStatusBar({
  connection,
  project,
  projectCount,
  runningCount,
  runId,
  latestRun,
  view,
  onSearch,
}: {
  connection: "connecting" | "live" | "reconnecting";
  project?: Project;
  projectCount: number;
  runningCount: number;
  runId?: string;
  latestRun?: Run;
  view: string;
  onSearch: () => void;
}) {
  const details = useRun(project ? runId || latestRun?.id : undefined);
  const run =
    details.data || (runId && latestRun?.id !== runId ? undefined : latestRun);
  const now = useNow();
  const jobs = run?.jobs || [];
  const completed = jobs.filter((job) =>
    ["SUCCESS", "FAILURE", "CANCELLED", "SKIPPED"].includes(job.status),
  ).length;
  const elapsed =
    run && isActive(run.status)
      ? Math.max(0, now - Date.parse(run.date))
      : run?.duration || 0;
  const connected = connection === "live";
  return (
    <footer
      aria-label="Studio status line"
      className="fixed inset-x-0 bottom-0 z-50 flex h-7 items-center overflow-hidden border-t border-accent/20 bg-sidebar font-mono text-[10px] text-muted shadow-[0_-2px_14px_#1a183755]"
    >
      <span className="relative flex h-full shrink-0 items-center gap-1.5 bg-gradient-to-r from-accent to-[#e591ff] pl-3 pr-5 font-bold tracking-wider text-canvas [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]">
        <IconTerminal2 size={13} />
        STUDIO
      </span>
      <span
        role="status"
        title={
          connected
            ? "Local engine connected · live updates"
            : connection === "connecting"
              ? "Connecting to the local engine"
              : "Connection lost · recovering logs"
        }
        className={`ml-1 flex shrink-0 items-center gap-1.5 px-2 ${connected ? "text-success" : "text-warning"}`}
      >
        <span
          className={`size-1.5 rounded-full ${connected ? "bg-success shadow-[0_0_5px_#55f0d766]" : "animate-pulse bg-warning"}`}
        />
        <span className="hidden sm:inline">
          {connected
            ? "LIVE"
            : connection === "connecting"
              ? "CONNECTING"
              : "RECONNECTING"}
        </span>
        <span className="sm:hidden">
          {connected ? "LIVE" : connection === "connecting" ? "WAIT" : "RETRY"}
        </span>
      </span>
      <span className="mx-1 hidden h-3 w-px shrink-0 bg-line sm:block" />
      <span
        title={project?.path || "Local workspace"}
        className="hidden min-w-0 max-w-48 items-center gap-1.5 px-2 text-text sm:flex"
      >
        <IconFolder size={12} className="shrink-0 text-accent" />
        <span className="truncate">{project?.name || "workspace"}</span>
      </span>
      {run?.branch && (
        <span
          title={`Git branch: ${run.branch}`}
          className="hidden min-w-0 max-w-36 items-center gap-1.5 px-2 text-accent lg:flex"
        >
          <IconGitBranch size={12} className="shrink-0" />
          <span className="truncate">{run.branch}</span>
        </span>
      )}
      <span className="hidden items-center gap-2 px-2 text-muted/70 xl:flex">
        <span className="text-line">/</span>
        {view}
      </span>
      <div className="ml-auto flex h-full min-w-0 items-center gap-2 pl-1 pr-2 sm:gap-3 sm:pr-3">
        {run && (
          <span
            className="flex shrink-0 items-center gap-1.5"
            title={`${run.title} · ${statusLabel(run.status)}`}
          >
            <StatusIcon status={run.status} />
            <span className="hidden text-text md:inline">
              {statusLabel(run.status)}
            </span>
          </span>
        )}
        {!!jobs.length && (
          <span
            className="hidden items-center gap-2 md:flex"
            title={`${completed} of ${jobs.length} steps finished`}
          >
            <span className="h-1 w-12 overflow-hidden rounded-full bg-elevated">
              <span
                className={`block h-full ${run?.status === "FAILURE" ? "bg-danger" : "bg-success"}`}
                style={{ width: `${(completed / jobs.length) * 100}%` }}
              />
            </span>
            <span className="tabular-nums">
              {completed}/{jobs.length}
            </span>
          </span>
        )}
        {run && (
          <span
            className="flex shrink-0 items-center gap-1 text-accent"
            title="Pipeline elapsed time"
          >
            <IconClock size={12} />
            <span className="tabular-nums">{duration(elapsed)}</span>
          </span>
        )}
        <span
          className="hidden shrink-0 items-center gap-1.5 border-l border-line pl-3 sm:flex"
          title="Active projects in this workspace"
        >
          <IconFolder size={12} />
          {projectCount}
          <span className="hidden lg:inline">projects</span>
        </span>
        <span
          className={`flex shrink-0 items-center gap-1.5 ${runningCount ? "text-[#71e4fe]" : "text-muted"}`}
          title="Pipelines currently running across the workspace"
        >
          <IconActivity size={12} />
          <span className="tabular-nums">{runningCount}</span>
          <span className="hidden lg:inline">running</span>
        </span>
        <button
          type="button"
          onClick={onSearch}
          aria-label="Open status line quick search"
          title="Quick search · ⌘ K / Ctrl K"
          className="hidden h-5 items-center gap-1 rounded border border-line bg-panel px-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent sm:flex"
        >
          <IconSearch size={11} />
          <IconCommand size={10} />K
        </button>
      </div>
    </footer>
  );
}
