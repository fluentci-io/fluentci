import { useEffect, useRef, useState } from "react";

export function Copy({
  text,
  label = "Copy command",
  iconOnly = false,
}: {
  text: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span role="status" className="max-w-40 text-xs text-muted">
        {status}
      </span>
      <button
        type="button"
        className={
          iconOnly
            ? "inline-flex size-8 items-center justify-center rounded text-muted transition-colors hover:text-accent focus-visible:outline-accent"
            : "copy-button"
        }
        aria-label={label}
        title={label}
        onClick={async () => {
          clearTimeout(timer.current);
          try {
            await navigator.clipboard.writeText(text);
            setStatus("Copied");
          } catch {
            setStatus("Select the command to copy.");
          }
          timer.current = setTimeout(() => setStatus(""), 3000);
        }}
      >
        {iconOnly ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 16H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v2" />
            <rect x="8" y="8" width="13" height="13" rx="3" />
          </svg>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
