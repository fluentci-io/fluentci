import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { SiteHeader } from "../SiteHeader";
import { SiteFooter } from "../SiteFooter";
import { ModuleLogo } from "../ModuleLogo";
import { DownloadIcon } from "../DownloadIcon";
import { SearchIcon } from "../SearchIcon";
import { Skeleton } from "../Skeleton";
import {
  getProfile,
  httpUrl,
  recordKey,
  type Profile,
} from "../../registry/client";
import { usePublisherModules } from "./usePublisherModules";

export function PublisherPage() {
  const { handle = "" } = useParams({ strict: false });
  const actor = handle.replace(/^@/, "");
  const [profile, setProfile] = useState<Profile>();
  const [failedAvatar, setFailedAvatar] = useState(false);
  const [search, setSearch] = useState("");
  const { items, total, loading, error, hasMore, loadMore, retry } =
    usePublisherModules(actor, search);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    setProfile(undefined);
    setFailedAvatar(false);
    setSearch("");
    void getProfile(actor, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setProfile(value);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [actor]);
  useEffect(() => {
    if (!sentinel.current || !hasMore || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, error, loadMore]);
  const identity = profile?.handle ?? actor;
  const name = profile?.displayName?.trim() || identity;
  const avatar = httpUrl(profile?.avatar);
  return (
    <>
      <SiteHeader />
      <main className="page-width py-12 sm:py-16">
        <div className="publisher-identity">
          <div className="publisher-avatar" aria-hidden="true">
            {avatar && !failedAvatar ? (
              <img
                src={avatar}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatar(true)}
              />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-medium tracking-tight sm:text-3xl">
              {name}
            </h1>
            <p className="mt-2 break-all font-mono text-sm text-muted">
              {identity.startsWith("did:") ? identity : `@${identity}`}
            </p>
            {profile?.description && (
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted">
                {profile.description}
              </p>
            )}
          </div>
        </div>
        <section aria-label="Published modules" className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <h2 className="text-lg font-medium">
              Modules{" "}
              {total !== undefined && (
                <span
                  className="ml-2 rounded-md bg-raised px-2 py-1 font-mono text-sm tabular-nums text-muted"
                  aria-label={`${total} published modules`}
                >
                  {total.toLocaleString()}
                </span>
              )}
            </h2>
            <label className="publisher-filter">
              <SearchIcon />
              <span className="sr-only">Filter published modules</span>
              <input
                type="search"
                placeholder="Filter modules…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="publisher-modules" aria-busy={loading}>
            {items.map((plugin) => (
              <Link
                key={`${plugin.author}/${plugin.name}`}
                to="/$handle/plugin/$rkey"
                params={{
                  handle: profile?.handle ?? plugin.author,
                  rkey: recordKey(plugin),
                }}
                className="publisher-module"
              >
                <ModuleLogo plugin={plugin} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-medium text-ink">
                      {plugin.name}
                    </h3>
                    {(plugin.downloads ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-1.5 font-mono text-sm text-muted"
                        aria-label={`${plugin.downloads!.toLocaleString()} downloads`}
                      >
                        <DownloadIcon />
                        {plugin.downloads!.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {plugin.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                      {plugin.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                    <span className="font-mono">v{plugin.version}</span>
                    {plugin.license && <span>{plugin.license}</span>}
                    {plugin.topics?.slice(0, 4).map((topic) => (
                      <span key={topic} className="module-tag">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
            {loading && (
              <div role="status" aria-label="Loading published modules">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="publisher-module">
                    <Skeleton className="size-16 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <p className="py-16 text-center text-sm text-muted">
                {search.trim()
                  ? "No modules match this filter."
                  : "No published modules yet."}
              </p>
            )}
            {error && (
              <div role="alert" className="py-8 text-center text-sm text-muted">
                <p>{error}</p>
                <button
                  type="button"
                  className="mt-4 text-accent"
                  onClick={retry}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
          <div ref={sentinel} className="h-px" aria-hidden="true" />
          {hasMore && !loading && !error && (
            <button
              type="button"
              onClick={loadMore}
              className="mx-auto mt-6 block text-sm text-accent"
            >
              Load more modules
            </button>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
