import { useEffect, useRef, useState, type FormEvent } from "react";
import { UsageChart } from "./UsageChart";
import {
  formatBytes,
  cacheTypes,
  type UsageSample,
  type ProtocolUsage,
} from "../../cache/usage";
import type { Account } from "../../auth/client";
import { cacheRequest } from "../../cache/client";
import { Skeleton } from "../Skeleton";
import { CacheTableSkeleton } from "./CacheSkeleton";
import { SearchIcon } from "../SearchIcon";

type Entry = { key: string; size: number; lastModified: string };
type Listing = {
  keys: Entry[];
  cursor?: string;
  totalBytes: number;
  totalKeys: number;
  matchedKeys?: number;
  protocols?: ProtocolUsage[];
};
const button =
  "rounded-lg border border-line px-3 py-2 text-sm hover:bg-raised disabled:opacity-50";
const field =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent";
export function CacheObjects({ account }: { account: Account }) {
  const [samples, setSamples] = useState<UsageSample[]>();
  const [historyError, setHistoryError] = useState("");
  const [listing, setListing] = useState<Listing>();
  const [search, setSearch] = useState("");
  const [prefix, setPrefix] = useState("");
  const [cursor, setCursor] = useState("");
  const [sort, setSort] = useState<"key" | "size" | "lastModified">("key");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [previous, setPrevious] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remove, setRemove] = useState<string>();
  const [confirm, setConfirm] = useState("");
  const lifetime = useRef<AbortController>();
  const filters = useRef<HTMLFormElement>(null);
  const [filterHeight, setFilterHeight] = useState(0);
  useEffect(() => {
    const element = filters.current;
    if (!element) return;
    const measure = () =>
      setFilterHeight(Math.ceil(element.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setCursor("");
    setPrevious([]);
    setSamples(undefined);
    void cacheRequest<{ samples: UsageSample[] }>(
      account,
      "getUsageHistory",
      {},
      controller.signal,
    )
      .then((history) => {
        if (!controller.signal.aborted) {
          setSamples(history.samples);
          setHistoryError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setHistoryError("Usage history unavailable");
      });
    return () => controller.abort();
  }, [account]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(
      () => {
        void cacheRequest<Listing>(
          account,
          "listKeys",
          {
            prefix,
            search: search.trim(),
            cursor,
            limit: 100,
            sort,
            direction,
          },
          controller.signal,
        )
          .then(async (result) => {
            if (controller.signal.aborted) return;
            setListing(result);
            try {
              const history = await cacheRequest<{ samples: UsageSample[] }>(
                account,
                "getUsageHistory",
                {},
                controller.signal,
              );
              if (!controller.signal.aborted) {
                setSamples(history.samples);
                setHistoryError("");
              }
            } catch {
              if (!controller.signal.aborted)
                setHistoryError("Usage history unavailable");
            }
          })
          .catch((reason) => {
            if (!controller.signal.aborted)
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Cache request failed",
              );
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [account, prefix, search, cursor, sort, direction]);
  function changeFilter(value: string, kind: "search" | "prefix") {
    if (kind === "search") setSearch(value);
    else setPrefix(value);
    setCursor("");
    setPrevious([]);
    setListing(undefined);
  }
  function sortBy(column: typeof sort) {
    setDirection(
      column === sort
        ? direction === "asc"
          ? "desc"
          : "asc"
        : column === "key"
          ? "asc"
          : "desc",
    );
    setSort(column);
    setCursor("");
    setPrevious([]);
    setListing(undefined);
  }
  function sortLabel(column: typeof sort, label: string) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-2 text-left hover:text-ink"
        disabled={pending}
        onClick={() => sortBy(column)}
      >
        {label}
        <span
          aria-hidden="true"
          className={sort === column ? "text-accent" : "text-muted opacity-50"}
        >
          {sort === column ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  }
  async function work(run: (signal: AbortSignal) => Promise<void>) {
    if (pending || loading || !lifetime.current) return;
    const signal = lifetime.current.signal;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await run(signal);
    } catch (reason) {
      if (!signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Cache request failed",
        );
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }
  async function load(signal: AbortSignal) {
    const result = await cacheRequest<Listing>(
      account,
      "listKeys",
      {
        prefix,
        search: search.trim(),
        cursor,
        limit: 100,
        sort,
        direction,
      },
      signal,
    );
    if (!signal.aborted) setListing(result);
    try {
      const history = await cacheRequest<{ samples: UsageSample[] }>(
        account,
        "getUsageHistory",
        {},
        signal,
      );
      if (!signal.aborted) {
        setSamples(history.samples);
        setHistoryError("");
      }
    } catch {
      if (!signal.aborted) setHistoryError("Usage history unavailable");
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void work((signal) => load(signal));
  };
  return (
    <section className="rounded-xl bg-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Cache entries</h2>
        <button
          className={`${button} text-red-400`}
          disabled={pending || loading}
          onClick={() => {
            setRemove("*");
            setConfirm("");
          }}
        >
          Clear cache
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        Explore and manage your own cache. Storage totals include all keys in
        your account.
      </p>
      {error && (
        <p role="alert" className="mt-4 break-words text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-accent">
          {notice}
        </p>
      )}
      {listing ? (
        <p className="mt-4 text-sm" aria-label="Cache usage">
          {formatBytes(listing.totalBytes)} used ·{" "}
          {listing.totalKeys.toLocaleString()} keys
        </p>
      ) : !error ? (
        <div role="status" aria-label="Loading cache usage" className="mt-4">
          <Skeleton className="h-5 w-40" />
        </div>
      ) : null}
      <UsageChart
        samples={samples}
        error={historyError || (!listing ? error : "")}
      />
      <form
        ref={filters}
        onSubmit={submit}
        className="sticky top-0 z-20 mt-5 space-y-3 bg-panel py-3"
      >
        <div className="flex flex-wrap gap-3">
          <label className="min-w-0 flex-1 text-sm" htmlFor="cache-search">
            Search cache entries
            <span className="relative mt-2 block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                <SearchIcon />
              </span>
              <input
                id="cache-search"
                type="search"
                className={`${field} pl-10`}
                value={search}
                onChange={(event) => changeFilter(event.target.value, "search")}
                disabled={pending}
                placeholder="Search all cache keys"
                maxLength={2048}
              />
            </span>
          </label>
          <label className="self-end text-sm" htmlFor="cache-type">
            Cache type
            <select
              id="cache-type"
              className={`${field} mt-2`}
              value={prefix}
              disabled={pending}
              onChange={(event) => changeFilter(event.target.value, "prefix")}
            >
              <option value="">All types</option>
              {Object.entries(cacheTypes).map(([key, type]) => (
                <option
                  key={key}
                  value={`${key === "buildkit" ? "oci" : key}/`}
                >
                  {type.label}
                </option>
              ))}
              {prefix &&
                !Object.keys(cacheTypes).some(
                  (key) => prefix === `${key === "buildkit" ? "oci" : key}/`,
                ) && <option value={prefix}>Custom prefix</option>}
            </select>
          </label>
          <button
            className={`${button} self-end`}
            disabled={pending || loading}
          >
            Refresh entries
          </button>
        </div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Filter storage by prefix</summary>
          <label className="mt-3 block" htmlFor="cache-prefix">
            Key prefix
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
              <SearchIcon />
            </span>
            <input
              id="cache-prefix"
              className={`${field} pl-10`}
              value={prefix}
              onChange={(event) => changeFilter(event.target.value, "prefix")}
              disabled={pending}
              placeholder="generic/ or bazel/"
              maxLength={2048}
            />
          </div>
        </details>
      </form>
      <div className="mt-5 rounded-lg border border-line">
        <table
          className="w-full table-fixed text-left text-sm"
          aria-label="Cache entries"
        >
          <thead
            style={{ top: filterHeight }}
            className="sticky z-10 border-b border-line bg-raised text-xs text-muted"
          >
            <tr>
              <th
                scope="col"
                aria-sort={
                  sort === "key"
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="px-4 py-3 font-medium"
              >
                {sortLabel("key", "Key")}
              </th>
              <th
                scope="col"
                aria-sort={
                  sort === "size"
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="w-20 px-2 py-3 font-medium sm:px-4"
              >
                {sortLabel("size", "Size")}
              </th>
              <th
                scope="col"
                aria-sort={
                  sort === "lastModified"
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="hidden w-36 px-4 py-3 font-medium sm:table-cell"
              >
                {sortLabel("lastModified", "Updated")}
              </th>
              <th scope="col" className="w-20 px-2 py-3 font-medium sm:px-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!listing && !error && (
              <CacheTableSkeleton columns={4} label="Loading cache entries" />
            )}
            {(listing?.keys ?? []).map((entry) => (
              <tr key={entry.key}>
                <td className="max-w-md px-4 py-3">
                  <code className="break-all font-mono text-xs">
                    {entry.key}
                  </code>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-muted sm:px-4">
                  {formatBytes(entry.size)}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted sm:table-cell">
                  {new Date(entry.lastModified).toLocaleString()}
                </td>
                <td className="px-2 py-3 text-right sm:px-4">
                  <button
                    className={button}
                    disabled={pending || loading}
                    aria-label={`Delete ${entry.key}`}
                    onClick={() => {
                      setRemove(entry.key);
                      setConfirm("");
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {listing && listing.keys.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No matching cache keys.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav
        className="mt-4 flex flex-wrap items-center justify-between gap-3"
        aria-label="Cache entries pagination"
      >
        <p className="text-xs text-muted" aria-live="polite">
          {listing
            ? `Page ${previous.length + 1}${listing.matchedKeys !== undefined ? ` of ${Math.max(1, Math.ceil(listing.matchedKeys / 100))} · ${listing.matchedKeys.toLocaleString()} matching keys` : ""}`
            : loading
              ? "Loading entries…"
              : "No entries loaded"}
        </p>
        <div className="flex gap-2">
          <button
            className={button}
            disabled={pending || loading || previous.length === 0}
            onClick={() => {
              setCursor(previous[previous.length - 1]);
              setPrevious((values) => values.slice(0, -1));
              setListing(undefined);
            }}
          >
            Previous
          </button>
          <button
            className={button}
            disabled={pending || loading || !listing?.cursor}
            onClick={() => {
              if (listing?.cursor) {
                setPrevious((values) => [...values, cursor]);
                setCursor(listing.cursor);
                setListing(undefined);
              }
            }}
          >
            Next
          </button>
        </div>
      </nav>
      {remove !== undefined && (
        <div
          className="mt-4 rounded-lg border border-line p-4"
          role="group"
          aria-label="Confirm deletion"
        >
          <p className="break-all text-sm">
            {remove === "*"
              ? "Delete every key in your cache? This cannot be undone. Type CLEAR to confirm."
              : `Delete ${remove}? This cannot be undone.`}
          </p>
          {remove === "*" && (
            <input
              aria-label="Type CLEAR to confirm"
              className={`${field} mt-3`}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
            />
          )}
          <div className="mt-3 flex gap-3">
            <button
              className={`${button} text-red-400`}
              disabled={pending || (remove === "*" && confirm !== "CLEAR")}
              onClick={() =>
                void work(async (signal) => {
                  await cacheRequest(
                    account,
                    remove === "*" ? "clearCache" : "deleteKey",
                    remove === "*" ? { confirm: true } : { key: remove },
                    signal,
                  );
                  if (signal.aborted) return;
                  setRemove(undefined);
                  setConfirm("");
                  await load(signal);
                  if (!signal.aborted)
                    setNotice(
                      "Deleted from storage. CDN copies may remain until their cache expires.",
                    );
                })
              }
            >
              Confirm deletion
            </button>
            <button
              className={button}
              disabled={pending || loading}
              onClick={() => setRemove(undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
