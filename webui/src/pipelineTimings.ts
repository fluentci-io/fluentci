import type { Run } from "./types";
import { isActive } from "./api";

export function spanDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${((ms % 60_000) / 1000).toFixed(1)}s`;
}

export function pipelineTimings(run: Run, now: number) {
  const runStart = Date.parse(run.date);
  const spans = run.jobs.map((job) => {
    const parsed = job.startedAt ? Date.parse(job.startedAt) : NaN;
    const started = Number.isFinite(parsed) && Number.isFinite(runStart);
    const offset = started ? Math.max(0, parsed - runStart) : null;
    const elapsed =
      job.status === "RUNNING" && started
        ? Math.max(0, now - parsed)
        : Math.max(0, job.duration ?? 0);
    return { job, offset, elapsed };
  });
  const end = Math.max(
    0,
    ...spans.map((span) =>
      span.offset === null ? 0 : span.offset + span.elapsed,
    ),
  );
  const elapsed =
    isActive(run.status) && Number.isFinite(runStart)
      ? Math.max(0, now - runStart)
      : Math.max(0, run.duration);
  return { spans, total: Math.max(elapsed, end) };
}
