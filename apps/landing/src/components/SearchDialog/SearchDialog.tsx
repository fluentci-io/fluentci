import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  getProfiles,
  cachedInitialResults,
  cachedProfiles,
  initialResults,
  uniquePlugins,
  moduleTitle,
  query,
  recordKey,
  type Plugin,
  type Profile,
} from "../../registry/client";
import { DownloadIcon } from "../DownloadIcon";
import { Author } from "../Author";
import { ModuleLogo } from "../ModuleLogo";
import { SearchResultsSkeleton } from "../SearchResultsSkeleton";
import { SearchIcon } from "../SearchIcon";

export function SearchDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Plugin[]>(
    () => cachedInitialResults() ?? [],
  );
  const [profiles, setProfiles] =
    useState<Record<string, Profile>>(cachedProfiles);
  const [loading, setLoading] = useState(
    () => cachedInitialResults() === undefined,
  );
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const q = text.trim();
    const cached = q ? undefined : cachedInitialResults();
    setLoading(cached === undefined);
    setError("");
    setItems(cached ?? []);
    setSelected(0);
    const timer = window.setTimeout(
      async () => {
        try {
          const plugins = q
            ? uniquePlugins(
                (
                  await query<{ packages: Plugin[] }>(
                    "searchPackages",
                    new URLSearchParams({ limit: "20", q }),
                    abort.signal,
                  )
                ).packages,
              )
            : await initialResults();
          if (abort.signal.aborted) return;
          setItems(plugins);
          setLoading(false);
          try {
            const authors = await getProfiles(
              plugins.map((plugin) => plugin.author),
              abort.signal,
            );
            if (!abort.signal.aborted) setProfiles(authors);
          } catch {
            /* A missing profile never prevents registry navigation. */
          }
        } catch (reason) {
          if (!abort.signal.aborted && cached === undefined) {
            setError(
              reason instanceof Error ? reason.message : "Search failed.",
            );
            setLoading(false);
          }
        }
      },
      q ? 200 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [text]);
  useEffect(() => {
    dialog.current
      ?.querySelector(`[data-result="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const paramsFor = (plugin: Plugin) => ({
    handle: profiles[plugin.author]?.handle ?? plugin.author,
    rkey: recordKey(plugin),
  });
  return (
    <dialog
      ref={dialog}
      className="module-search-dialog"
      aria-labelledby="module-search-title"
      onCancel={close}
      onClose={close}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="module-search-surface">
        <h2 id="module-search-title" className="sr-only">
          Search FluentCI modules
        </h2>
        <div className="module-search-field">
          <SearchIcon />
          <input
            ref={input}
            placeholder="Search module"
            aria-label="Search module"
            value={text}
            maxLength={200}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="module-results"
            aria-activedescendant={
              items[selected] ? `module-result-${selected}` : undefined
            }
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                setSelected((index) =>
                  items.length
                    ? (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length
                    : 0,
                );
              }
              if (event.key === "Enter" && items[selected]) {
                event.preventDefault();
                void navigate({
                  to: "/$handle/plugin/$rkey",
                  params: paramsFor(items[selected]),
                });
                close();
              }
            }}
          />
          <button onClick={close} aria-label="Close search">
            <kbd>esc</kbd>
          </button>
        </div>
        <div
          className="module-results"
          id="module-results"
          role="listbox"
          aria-label="Modules"
          aria-busy={loading}
        >
          {loading ? (
            <SearchResultsSkeleton />
          ) : error ? (
            <p className="search-message" role="alert">
              {error}
            </p>
          ) : !items.length ? (
            <p className="search-message" role="status">
              No modules found. Try another name or topic.
            </p>
          ) : (
            items.map((plugin, index) => (
              <div
                key={plugin.uri}
                role="option"
                aria-selected={selected === index}
                id={`module-result-${index}`}
                className="relative"
              >
                <Link
                  to="/$handle/plugin/$rkey"
                  params={paramsFor(plugin)}
                  className={`module-result ${index === selected ? "is-selected" : ""}`}
                  data-result={index}
                  tabIndex={-1}
                  onMouseEnter={() => setSelected(index)}
                  onClick={close}
                >
                  <ModuleLogo key={plugin.logo} plugin={plugin} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-ink">
                        {moduleTitle(
                          plugin,
                          profiles[plugin.author]?.handle ?? plugin.author,
                        )}
                      </span>
                      {(plugin.downloads ?? 0) > 0 && (
                        <span
                          className="shrink-0 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-muted"
                          aria-label={`${plugin.downloads!.toLocaleString()} downloads`}
                        >
                          <DownloadIcon /> {plugin.downloads!.toLocaleString()}
                        </span>
                      )}
                    </span>
                    {plugin.description && (
                      <span className="mt-1 block truncate text-xs text-muted">
                        {plugin.description}
                      </span>
                    )}
                    <span className="mt-2 flex items-center justify-between gap-3">
                      <span className="invisible" aria-hidden="true">
                        <Author
                          profile={profiles[plugin.author]}
                          fallback={plugin.author}
                        />
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted">
                        {plugin.version}
                      </span>
                    </span>
                  </span>
                </Link>
                <Link
                  to="/$handle"
                  params={{
                    handle: profiles[plugin.author]?.handle ?? plugin.author,
                  }}
                  className="search-result-author-link"
                  aria-label={`View @${profiles[plugin.author]?.handle ?? plugin.author} profile`}
                  onClick={close}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Author
                    profile={profiles[plugin.author]}
                    fallback={plugin.author}
                  />
                </Link>
              </div>
            ))
          )}
        </div>
        <footer className="module-search-footer">
          <span>FluentCI registry</span>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate{" "}
            <span className="ml-3">
              <kbd>↵</kbd> open
            </span>
          </span>
        </footer>
      </div>
    </dialog>
  );
}
