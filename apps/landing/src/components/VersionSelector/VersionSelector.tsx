import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { query, recordKey, type Plugin } from "../../registry/client";

export function VersionSelector({
  plugin,
  handle,
}: {
  plugin: Plugin;
  handle: string;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Plugin[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setVersions([]);
    setFilter("");
    void (async () => {
      try {
        const params = new URLSearchParams({
          author: plugin.author,
          filter: `name==${plugin.name}`,
          sort: "newest",
          limit: "100",
        });
        const collected: Plugin[] = [];
        const cursors = new Set<string>();
        for (;;) {
          const page = await query<{ packages: Plugin[]; cursor?: string }>(
            "searchPackages",
            params,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          collected.push(...page.packages);
          setVersions([
            ...new Map(collected.map((item) => [item.uri, item])).values(),
          ]);
          if (!page.cursor) break;
          if (cursors.has(page.cursor))
            throw new Error("Unable to load remaining versions.");
          cursors.add(page.cursor);
          params.set("cursor", page.cursor);
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load versions.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, plugin.author, plugin.name, retry]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        (event instanceof KeyboardEvent && event.key === "Escape") ||
        (event instanceof PointerEvent &&
          !root.current?.contains(event.target as Node))
      ) {
        if (root.current) root.current.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <details
      ref={root}
      className="version-selector"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-label={`Choose module version, current ${plugin.version}`}
        className="cursor-pointer font-mono text-accent"
      >
        {plugin.version} <span aria-hidden="true">⌄</span>
      </summary>
      {open && (
        <div
          className="version-dropdown"
          role="region"
          aria-label="Module versions"
        >
          <input
            autoFocus
            aria-label="Filter versions"
            placeholder="Filter versions…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="version-options" aria-busy={loading}>
            {versions
              .filter((item) =>
                item.version
                  .toLowerCase()
                  .includes(filter.trim().toLowerCase()),
              )
              .map((item) => (
                <Link
                  key={item.uri}
                  to="/$handle/plugin/$rkey"
                  params={{ handle, rkey: recordKey(item) }}
                  aria-current={item.uri === plugin.uri ? "page" : undefined}
                  onClick={() => {
                    if (root.current) root.current.open = false;
                  }}
                >
                  <span>{item.version}</span>
                  {item.uri === plugin.uri && (
                    <span className="text-muted">Current</span>
                  )}
                </Link>
              ))}
            {loading && <p role="status">Loading versions…</p>}
            {!loading &&
              !error &&
              !versions.some((item) =>
                item.version
                  .toLowerCase()
                  .includes(filter.trim().toLowerCase()),
              ) && <p>No matching versions.</p>}
            {error && (
              <p role="alert">
                {error}{" "}
                <button
                  className="text-accent"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry
                </button>
              </p>
            )}
          </div>
        </div>
      )}
    </details>
  );
}
