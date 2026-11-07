import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { Plugin } from "../../registry/client";
import { ModuleDocs } from "../ModuleDocs";
import { Readme } from "../Readme";

export function ModuleDocumentation({
  plugin,
  handle,
  query = "",
  showDocs = false,
}: {
  plugin: Plugin;
  handle: string;
  query?: string;
  showDocs?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (showDocs) setSelected(1);
  }, [showDocs]);
  useEffect(() => {
    if (query.trim()) setSelected(1);
  }, [query]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 1
          : ["ArrowLeft", "ArrowRight"].includes(event.key)
            ? 1 - index
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setSelected(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  return (
    <div className="mt-8 min-w-0">
      <div
        role="tablist"
        aria-label="Module documentation"
        className="flex gap-6 border-b border-line"
      >
        {["README", "Docs"].map((label, index) => (
          <button
            key={label}
            id={`${id}-tab-${index}`}
            role="tab"
            aria-selected={selected === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => navigate(event, index)}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm transition-colors ${selected === index ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
            {index === 1 && (
              <span className="rounded-full bg-panel px-2 py-0.5 font-mono text-xs tabular-nums text-muted">
                {plugin.functions?.length ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>
      {[0, 1].map((index) => (
        <div
          key={index}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0}
          hidden={selected !== index}
        >
          {selected === index &&
            (index === 0 ? (
              <Readme plugin={plugin} />
            ) : (
              <ModuleDocs plugin={plugin} handle={handle} query={query} />
            ))}
        </div>
      ))}
    </div>
  );
}
