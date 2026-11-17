import { useEffect, useRef, useState, type FormEvent } from "react";
import { UsageChart } from "./UsageChart";
import { formatBytes, type UsageSample } from "../../cache/usage";
import type { Account } from "../../auth/client";
import { cacheRequest } from "../../cache/client";

type Entry = { key: string; size: number; lastModified: string };
type Listing = {
  keys: Entry[];
  cursor?: string;
  totalBytes: number;
  totalKeys: number;
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remove, setRemove] = useState<string>();
  const [confirm, setConfirm] = useState("");
  const lifetime = useRef<AbortController>();
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setPending(true);
    void cacheRequest<Listing>(account, "listKeys", {}, controller.signal)
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
            reason instanceof Error ? reason.message : "Cache request failed",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [account]);
  async function work(run: (signal: AbortSignal) => Promise<void>) {
    if (pending || !lifetime.current) return;
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
  async function load(signal: AbortSignal, more = false) {
    const result = await cacheRequest<Listing>(
      account,
      "listKeys",
      {
        prefix,
        ...(more && listing?.cursor ? { cursor: listing.cursor } : {}),
      },
      signal,
    );
    if (!signal.aborted)
      setListing((previous) => ({
        ...result,
        keys: more ? [...(previous?.keys ?? []), ...result.keys] : result.keys,
      }));
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
          disabled={pending}
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
      {listing && (
        <p className="mt-4 text-sm" aria-label="Cache usage">
          {formatBytes(listing.totalBytes)} used ·{" "}
          {listing.totalKeys.toLocaleString()} keys
        </p>
      )}
      <UsageChart samples={samples} error={historyError} />
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-0 flex-1 text-sm" htmlFor="cache-search">
            Search cache entries
            <input
              id="cache-search"
              type="search"
              className={`${field} mt-2`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Quick filter by key"
            />
          </label>
          <button className={`${button} self-end`} disabled={pending}>
            Refresh entries
          </button>
        </div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Filter storage by prefix</summary>
          <label className="mt-3 block" htmlFor="cache-prefix">
            Key prefix
          </label>
          <input
            id="cache-prefix"
            className={`${field} mt-2`}
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            placeholder="generic/ or bazel/"
            maxLength={2048}
          />
        </details>
      </form>
      {pending && !listing && (
        <p role="status" className="mt-5 text-sm text-muted">
          Loading cache entries…
        </p>
      )}
      <div className="mt-5 overflow-x-auto rounded-lg border border-line">
        <table
          className="w-full table-fixed text-left text-sm"
          aria-label="Cache entries"
        >
          <thead className="border-b border-line bg-raised text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Key
              </th>
              <th scope="col" className="w-20 px-2 py-3 font-medium sm:px-4">
                Size
              </th>
              <th
                scope="col"
                className="hidden w-36 px-4 py-3 font-medium sm:table-cell"
              >
                Updated
              </th>
              <th scope="col" className="w-20 px-2 py-3 font-medium sm:px-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(listing?.keys ?? [])
              .filter((entry) =>
                entry.key.toLowerCase().includes(search.toLowerCase()),
              )
              .map((entry) => (
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
                      disabled={pending}
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
            {listing &&
              listing.keys.filter((entry) =>
                entry.key.toLowerCase().includes(search.toLowerCase()),
              ).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    No matching cache keys.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
      {listing?.cursor && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className={button}
            disabled={pending}
            onClick={() => void work((signal) => load(signal, true))}
          >
            More keys
          </button>
          <p className="text-xs text-muted">
            Search filters loaded entries. Load more to search additional keys.
          </p>
        </div>
      )}
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
              disabled={pending}
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
