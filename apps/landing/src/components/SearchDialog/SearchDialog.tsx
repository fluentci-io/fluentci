import { useAccountSearch } from "../../registry/useAccountSearch";
import { AccountSearchResult } from "../AccountSearchResult";
import { Skeleton } from "../Skeleton";
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
  const accountSearch = useAccountSearch(text, true);
  const accounts = accountSearch.items;
  const resultCount = items.length + accounts.length;
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
                    new URLSearchParams({
                      limit: "20",
                      q,
                      sort: "downloads",
                      latest: "true",
                    }),
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
  }, [selected, resultCount]);
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
          Search FluentCI modules and accounts
        </h2>
        <div className="module-search-field">
          <SearchIcon />
          <input
            ref={input}
            placeholder="Search modules or accounts"
            aria-label="Search modules or accounts"
            value={text}
            maxLength={200}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="module-results"
            aria-activedescendant={
              selected < resultCount ? `module-result-${selected}` : undefined
            }
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                setSelected((index) =>
                  resultCount
                    ? (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        resultCount) %
                      resultCount
                    : 0,
                );
              }
              if (event.key === "Enter" && selected < resultCount) {
                event.preventDefault();
                if (items[selected])
                  void navigate({
                    to: "/$handle/plugin/$rkey",
                    params: paramsFor(items[selected]),
                  });
                else
                  void navigate({
                    to: "/$handle",
                    params: {
                      handle: accounts[selected - items.length].handle,
                    },
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
          aria-label="Modules and accounts"
          aria-busy={loading || accountSearch.loading}
        >
          {loading ? (
            <SearchResultsSkeleton />
          ) : error ? (
            <p className="search-message" role="alert">
              {error}
            </p>
          ) : !items.length ? (
            !accounts.length && !accountSearch.loading ? (
              <p className="search-message" role="status">
                No modules or accounts found. Try another name, handle, or
                topic.
              </p>
            ) : null
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
          {accountSearch.loading && (
            <div
              role="status"
              aria-label="Searching accounts"
              className="flex items-center gap-3 p-3"
            >
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          )}
          {accounts.length > 0 && (
            <div role="group" aria-label="Accounts">
              <p className="px-3 pb-1 pt-3 text-xs text-muted">Accounts</p>
              {accounts.map((profile, index) => (
                <AccountSearchResult
                  key={profile.did}
                  profile={profile}
                  index={items.length + index}
                  selected={selected === items.length + index}
                  select={() => setSelected(items.length + index)}
                  close={close}
                />
              ))}
            </div>
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
