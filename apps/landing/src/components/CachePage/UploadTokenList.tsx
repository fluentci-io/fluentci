import { useEffect, useRef, useState } from "react";
import type { Account } from "../../auth/client";
import { cacheRequest, type UploadTokenRecord } from "../../cache/client";
import { CacheTableSkeleton } from "./CacheSkeleton";

const button =
  "rounded-lg border border-line px-3 py-2 text-sm hover:bg-raised disabled:opacity-50";
type Page = { tokens: UploadTokenRecord[]; cursor?: string };

export function UploadTokenList({
  account,
  enabled,
  refreshKey,
  onRevoke,
}: {
  account: Account;
  enabled: boolean;
  refreshKey?: string;
  onRevoke: (id: string) => void;
}) {
  const [page, setPage] = useState<Page>();
  const [cursor, setCursor] = useState("");
  const [previous, setPrevious] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string>();
  const [error, setError] = useState("");
  const revokedCallback = useRef(onRevoke);
  useEffect(() => {
    revokedCallback.current = onRevoke;
  }, [onRevoke]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void cacheRequest<Page>(
      account,
      "listTokens",
      cursor ? { cursor } : {},
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setPage(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load upload tokens.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [account, enabled, cursor, revision, refreshKey]);
  useEffect(() => {
    const controller = new AbortController();
    if (!revoking) return;
    void cacheRequest(
      account,
      "revokeToken",
      { id: revoking },
      controller.signal,
    )
      .then(() => {
        if (controller.signal.aborted) return;
        revokedCallback.current(revoking);
        setPage(
          (current) =>
            current && {
              ...current,
              tokens: current.tokens.map((token) =>
                token.id === revoking ? { ...token, active: false } : token,
              ),
            },
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not revoke upload token.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRevoking(undefined);
      });
    return () => controller.abort();
  }, [account, revoking]);
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Issued upload tokens</h3>
        <button
          type="button"
          className={button}
          disabled={loading || Boolean(revoking)}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh tokens
        </button>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted">
        Token secrets are redacted. Copy a newly generated token before leaving
        this page.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-4 overflow-x-auto rounded-lg border border-line">
        <table
          className="w-full min-w-[32rem] text-left text-sm"
          aria-label="Upload tokens"
          aria-busy={loading}
        >
          <thead className="border-b border-line bg-raised text-xs text-muted">
            <tr>
              {["Token", "Created", "Expires", "Status", "Actions"].map(
                (title) => (
                  <th key={title} scope="col" className="px-4 py-3 font-medium">
                    {title}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <CacheTableSkeleton columns={5} label="Loading upload tokens" />
            ) : (
              page?.tokens.map((token) => {
                const expired = Date.parse(token.expiresAt) <= Date.now();
                return (
                  <tr key={token.id}>
                    <td className="px-4 py-3">
                      <p
                        className="font-mono"
                        aria-label="Redacted upload token"
                      >
                        ••••••••••••••••
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        ID · {token.id.slice(-8)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(token.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(token.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!token.active
                        ? "Revoked"
                        : expired
                          ? "Expired"
                          : "Active"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className={button}
                        disabled={!token.active || expired || Boolean(revoking)}
                        aria-label={`Revoke token ${token.id.slice(-8)}`}
                        onClick={() => {
                          setError("");
                          setRevoking(token.id);
                        }}
                      >
                        {revoking === token.id ? "Revoking…" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            {!loading && page?.tokens.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No upload tokens issued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav
        aria-label="Upload token pagination"
        className="mt-4 flex items-center justify-between gap-3"
      >
        <button
          type="button"
          className={button}
          disabled={loading || Boolean(revoking) || previous.length === 0}
          onClick={() => {
            setCursor(previous[previous.length - 1]);
            setPrevious((values) => values.slice(0, -1));
          }}
        >
          Previous
        </button>
        <span className="text-xs text-muted">Page {previous.length + 1}</span>
        <button
          type="button"
          className={button}
          disabled={loading || Boolean(revoking) || !page?.cursor}
          onClick={() => {
            setPrevious((values) => [...values, cursor]);
            setCursor(page!.cursor!);
          }}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
