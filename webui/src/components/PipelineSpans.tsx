import type { Job, Run } from "../types";
import { isActive } from "../api";
import { StatusIcon, statusLabel } from "./ui";

import { pipelineTimings, spanDuration } from "../pipelineTimings";

function spanColor(status: string | null) {
  if (status === "FAILURE")
    return "border-danger bg-danger/50 shadow-[0_0_8px_#ff709d55]";
  if (status === "RUNNING")
    return "animate-pulse border-[#71e4fe] bg-[#71e4fe]/40 shadow-[0_0_8px_#71e4fe55]";
  if (status === "SUCCESS")
    return "border-success bg-success/45 shadow-[0_0_8px_#55f0d744]";
  return "border-muted/50 bg-muted/20";
}

export function PipelineSpans({
  run,
  now,
  onSelect,
}: {
  run: Run;
  now: number;
  onSelect: (job: Job) => void;
}) {
  const { spans, total } = pipelineTimings(run, now);
  const scale = Math.max(total, 1);
  const slowest = spans
    .filter((span) => span.offset !== null)
    .reduce<(typeof spans)[number] | undefined>(
      (longest, span) =>
        !longest || span.elapsed > longest.elapsed ? span : longest,
      undefined,
    );
  return (
    <section
      aria-label="Pipeline spans"
      className="rounded-xl border border-line bg-panel p-4"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Pipeline spans</h3>
          <p className="mt-1 text-xs text-muted">
            Step timings on a shared timeline. Select a span to inspect its
            logs.
          </p>
        </div>
        <span className="text-[10px] text-muted">
          {isActive(run.status) ? "Live timings" : "Recorded timings"}
        </span>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        {[
          ["Elapsed", spanDuration(total)],
          [
            "Started steps",
            `${spans.filter((span) => span.offset !== null).length} / ${spans.length}`,
          ],
          [
            "Running",
            String(
              spans.filter((span) => span.job.status === "RUNNING").length,
            ),
          ],
          [
            "Longest step",
            slowest
              ? `${slowest.job.name} · ${spanDuration(slowest.elapsed)}`
              : "—",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-lg border border-line bg-canvas/40 p-3"
          >
            <p className="text-[10px] text-muted">{label}</p>
            <p className="mt-2 truncate font-mono text-[11px]" title={value}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[160px_minmax(0,1fr)_68px] gap-3 pb-2 text-[10px] text-muted">
            <span>Span / step</span>
            <div className="flex justify-between">
              {[0, 1, 2, 3, 4].map((tick) => (
                <span key={tick}>{spanDuration((total * tick) / 4)}</span>
              ))}
            </div>
            <span className="text-right">Duration</span>
          </div>
          <div className="grid grid-cols-[160px_minmax(0,1fr)_68px] items-center gap-3 border-y border-line py-3">
            <div className="flex items-center gap-2 text-xs">
              <StatusIcon status={run.status} />
              <span className="truncate" title={run.title}>
                {run.title}
              </span>
            </div>
            <div
              className={`h-4 rounded border ${spanColor(run.status)}`}
              title={`Pipeline · ${spanDuration(total)}`}
            />
            <span className="text-right font-mono text-[10px] text-muted">
              {spanDuration(total)}
            </span>
          </div>
          {spans.map(({ job, offset, elapsed }) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelect(job)}
              aria-label={`Inspect ${job.name} span`}
              className="grid w-full grid-cols-[160px_minmax(0,1fr)_68px] items-center gap-3 rounded-md py-3 text-left hover:bg-elevated focus-visible:outline-offset-0"
              title={`${job.name} · ${statusLabel(job.status)}${offset !== null ? ` · starts at ${spanDuration(offset)} · ${spanDuration(elapsed)}` : ""}`}
            >
              <span className="flex min-w-0 items-center gap-2 pl-3 text-xs">
                <StatusIcon status={job.status} />
                <span className="truncate">{job.name}</span>
              </span>
              <span
                className="relative block h-5"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, var(--color-line) 1px, transparent 1px)",
                  backgroundSize: "25% 100%",
                }}
              >
                {offset === null ? (
                  <span className="pl-2 text-[10px] text-muted">
                    {job.status === "PENDING"
                      ? "Not started"
                      : job.status === "SKIPPED"
                        ? "Skipped"
                        : "Timing unavailable"}
                  </span>
                ) : (
                  <span
                    className={`absolute top-0.5 block h-4 rounded border ${spanColor(job.status)}`}
                    style={{
                      left: `${Math.min(100, (offset / scale) * 100)}%`,
                      width: `${Math.min(Math.max((elapsed / scale) * 100, 0.75), 100 - (offset / scale) * 100)}%`,
                    }}
                  />
                )}
              </span>
              <span className="text-right font-mono text-[10px] text-muted">
                {offset === null ? "—" : spanDuration(elapsed)}
              </span>
            </button>
          ))}
          {!spans.length && (
            <p className="py-8 text-center text-xs text-muted">
              Spans appear as pipeline steps start.
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-[10px] text-muted">
        {[
          ["bg-success", "Passed"],
          ["bg-[#71e4fe]", "Running"],
          ["bg-danger", "Failed"],
          ["bg-muted/40", "Cancelled / skipped"],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
