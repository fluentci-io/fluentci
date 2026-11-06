import { workflowSearch } from "../state";
import { Link } from "react-router-dom";
import type { Run } from "../types";
import { date, duration, statusLabel } from "./ui";

const colors: Record<string, string> = {
  SUCCESS: "bg-success/70 hover:bg-success",
  FAILURE: "bg-danger/80 hover:bg-danger",
  RUNNING: "animate-pulse bg-accent hover:bg-accent",
  PENDING: "bg-warning/70 hover:bg-warning",
  CANCELLED: "bg-muted/50 hover:bg-muted",
};

export function HistoryBars({
  runs,
  projectId,
  selectedId,
  compact = false,
}: {
  runs: Run[];
  projectId: string;
  selectedId?: string;
  compact?: boolean;
}) {
  const recent = runs.slice(0, compact ? 24 : 50).reverse();
  const maxDuration = Math.max(...recent.map((run) => run.duration), 1);
  return (
    <div
      className="flex min-w-0 items-end gap-1 sm:gap-1.5"
      aria-label="Build history"
    >
      {recent.map((run) => {
        const label = `${statusLabel(run.status)} · ${date(run.date)} · ${duration(run.duration)} · ${run.id.slice(0, 8)}`;
        return (
          <div
            key={run.id}
            className="group relative flex min-w-0 flex-1 items-end"
            style={{ maxWidth: compact ? 12 : 22 }}
          >
            <Link
              to={`/project/${projectId}/run/${run.id}${workflowSearch(run.workflowId)}`}
              aria-label={label}
              className={`block w-full min-w-px rounded-sm transition-colors outline-offset-4 ${colors[run.status || ""] || "bg-muted/30"} ${selectedId === run.id ? "ring-2 ring-accent ring-offset-3 ring-offset-panel" : ""}`}
              style={{
                height: compact ? 24 : 22 + (run.duration / maxDuration) * 34,
              }}
            />
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 hidden w-max max-w-64 -translate-x-1/2 rounded-lg border border-line bg-elevated px-3 py-2 text-xs shadow-xl group-hover:block group-focus-within:block"
            >
              <div className="font-medium">
                {statusLabel(run.status)}{" "}
                <span className="ml-3 font-mono text-muted">
                  {run.id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-1 text-muted">
                {date(run.date)}{" "}
                <span className="ml-3">{duration(run.duration)}</span>
              </div>
            </div>
          </div>
        );
      })}
      {!recent.length && (
        <span className="text-xs text-muted">
          History appears after your first run.
        </span>
      )}
    </div>
  );
}
