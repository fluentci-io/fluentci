import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  Copy,
  LoaderCircle,
  OctagonX,
  X,
  XCircle,
} from "lucide-react";

export function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function StatusIcon({
  status,
  className = "",
}: {
  status?: string | null;
  className?: string;
}) {
  const props = { size: 17, "aria-hidden": true as const, className };
  switch (status) {
    case "SUCCESS":
      return (
        <CheckCircle2 {...props} className={`text-success ${className}`} />
      );
    case "FAILURE":
      return <XCircle {...props} className={`text-danger ${className}`} />;
    case "RUNNING":
      return (
        <LoaderCircle
          {...props}
          className={`animate-spin text-accent ${className}`}
        />
      );
    case "PENDING":
      return (
        <CircleDashed {...props} className={`text-warning ${className}`} />
      );
    case "CANCELLED":
      return <OctagonX {...props} className={`text-muted ${className}`} />;
    default:
      return <Circle {...props} className={`text-muted ${className}`} />;
  }
}

export function statusLabel(status?: string | null) {
  return (
    (
      {
        SUCCESS: "Passed",
        FAILURE: "Failed",
        RUNNING: "Running",
        PENDING: "Queued",
        CANCELLED: "Cancelled",
        SKIPPED: "Skipped",
      } as Record<string, string>
    )[status || ""] || "Not run"
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium">
      <StatusIcon status={status} />
      {statusLabel(status)}
    </span>
  );
}

export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="my-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger/25 bg-danger/5 p-4 text-sm text-danger"
    >
      <XCircle size={17} />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {error instanceof Error ? error.message : String(error)}
      </span>
      {retry && (
        <button className="btn-secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-line p-8 text-center">
      <div className="mb-4 text-muted">{icon}</div>
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-2 max-w-md text-sm leading-6 text-muted">
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-24 text-sm text-muted"
    >
      <LoaderCircle size={18} className="animate-spin" />
      Loading workspace…
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`modal ${wide ? "max-w-2xl" : "max-w-lg"}`}
    >
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="font-medium">{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className="btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
        } catch {
          setFailed(true);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {failed ? "Copy unavailable" : copied ? "Copied" : label}
    </button>
  );
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
