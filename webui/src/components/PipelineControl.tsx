import { Play, RotateCcw, Square, LoaderCircle } from "lucide-react";
import { isActive } from "../api";
import type { Run } from "../types";

export function PipelineControl({
  run,
  pending = false,
  disabled = false,
  onRun,
  onCancel,
}: {
  run?: Run | null;
  pending?: boolean;
  disabled?: boolean;
  onRun: () => void;
  onCancel: () => void;
}) {
  const active = isActive(run?.status);
  const label = active ? "Cancel" : run ? "Restart" : "Run";
  return (
    <button
      className={active ? "btn-cancel" : "btn-primary"}
      disabled={pending || disabled}
      onClick={active ? onCancel : onRun}
      aria-label={`${label} pipeline`}
    >
      {pending ? (
        <LoaderCircle size={15} className="animate-spin" />
      ) : active ? (
        <Square size={14} />
      ) : run ? (
        <RotateCcw size={15} />
      ) : (
        <Play size={15} fill="currentColor" />
      )}
      {pending ? (active ? "Cancelling…" : "Starting…") : label}
    </button>
  );
}
