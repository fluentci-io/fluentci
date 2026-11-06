import { useEffect, useRef, useState } from "react";

export function Copy({
  text,
  label = "Copy command",
}: {
  text: string;
  label?: string;
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
        className="copy-button"
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
        {label}
      </button>
    </div>
  );
}
