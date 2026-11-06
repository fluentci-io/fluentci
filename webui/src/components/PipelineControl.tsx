import {
  IconPlayerPlay as Play,
  IconRefresh as RotateCcw,
  IconPlayerStop as Square,
  IconLoader2 as LoaderCircle,
} from "@tabler/icons-react";
import { isActive } from "../api";
import type { Run } from "../types";

export function PipelineControl({
  run,
  pending = false,
  disabled = false,
  onRun,
  onCancel,
  compact = false,
}: {
  run?: Run | null;
  pending?: boolean;
  disabled?: boolean;
  onRun: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const active = isActive(run?.status);
  const label = active ? "Cancel" : run ? "Restart" : "Run";
  return (
    <button
      className={`${active ? "btn-cancel" : "btn-primary"} ${compact ? "!px-2 !py-1.5 text-xs" : ""}`}
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
