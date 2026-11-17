import { useEffect, useRef, useState, type FormEvent } from "react";
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
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = value / 1024,
    unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}
export function CacheObjects({ account }: { account: Account }) {
  const [listing, setListing] = useState<Listing>();
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
    return () => controller.abort();
  }, []);
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
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void work((signal) => load(signal));
  };
  return (
    <section className="rounded-xl border border-line bg-panel p-6 sm:p-8">
      <h2 className="text-xl">Cache storage</h2>
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
      <form onSubmit={submit} className="mt-5 flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 text-sm">
          Key prefix
          <input
            className={`${field} mt-2`}
            value={prefix}
            onChange={(event) => {
              setPrefix(event.target.value);
              setListing(undefined);
            }}
            placeholder="generic/ or bazel/"
            maxLength={2048}
          />
        </label>
        <button className={`${button} self-end`} disabled={pending}>
          Explore keys
        </button>
      </form>
      {listing && (
        <>
          <ul className="mt-5 space-y-3">
            {listing.keys.map((entry) => (
              <li
                key={entry.key}
                className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs">{entry.key}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatBytes(entry.size)} ·{" "}
                    {new Date(entry.lastModified).toLocaleString()}
                  </p>
                </div>
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
              </li>
            ))}
          </ul>
          {listing.keys.length === 0 && (
            <p className="mt-4 text-sm text-muted">No matching cache keys.</p>
          )}
          {listing.cursor && (
            <button
              className={`${button} mt-4`}
              disabled={pending}
              onClick={() => void work((signal) => load(signal, true))}
            >
              More keys
            </button>
          )}
        </>
      )}
      <button
        className={`${button} mt-6 text-red-400`}
        disabled={pending}
        onClick={() => {
          setRemove("*");
          setConfirm("");
        }}
      >
        Clear cache
      </button>
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
