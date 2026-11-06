import { useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState("");
  return (
    <div className="usage-command">
      <code>{command}</code>
      <button
        className="copy-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setStatus("Copied");
          } catch {
            setStatus("Select and copy the command above.");
          }
        }}
      >
        Copy
      </button>
      <span role="status" className="col-span-2 text-xs text-muted">
        {status}
      </span>
    </div>
  );
}
