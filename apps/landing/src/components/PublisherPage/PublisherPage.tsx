import { UserIcon } from "../UserIcon";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { SiteHeader } from "../SiteHeader";
import { ScrollToTop } from "../ScrollToTop";
import { SiteFooter } from "../SiteFooter";
import { ModuleLogo } from "../ModuleLogo";
import { LikeButton } from "../LikeButton";
import { DownloadIcon } from "../DownloadIcon";
import { SearchIcon } from "../SearchIcon";
import { Skeleton } from "../Skeleton";
import {
  getProfile,
  httpUrl,
  recordKey,
  type Profile,
} from "../../registry/client";
import { usePublisherModules, type ModuleSort } from "./usePublisherModules";

export function PublisherPage() {
  const { handle = "" } = useParams({ strict: false });
  const actor = handle.replace(/^@/, "");
  const [profile, setProfile] = useState<Profile>();
  const [failedAvatar, setFailedAvatar] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ModuleSort>("downloads");
  const [showPinnedIdentity, setShowPinnedIdentity] = useState(false);
  const profileHeader = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"modules" | "likes">("modules");
  const published = usePublisherModules(actor, search, sort);
  const liked = usePublisherModules(
    actor,
    search,
    sort,
    "likes",
    tab === "likes",
  );
  const { items, loading, error, hasMore, loadMore, retry } =
    tab === "likes" ? liked : published;
  const { total, totalDownloads } = published;
  const sentinel = useRef<HTMLDivElement>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function focusFilter(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "f" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector("dialog[open]") ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input, textarea, select, [contenteditable]:not([contenteditable=false])",
          ))
      )
        return;
      if (filterInput.current) {
        event.preventDefault();
        filterInput.current.focus();
      }
    }
    document.addEventListener("keydown", focusFilter);
    return () => document.removeEventListener("keydown", focusFilter);
  }, []);
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
    setShowPinnedIdentity(false);
    if (!profileHeader.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowPinnedIdentity(
        !entry.isIntersecting && entry.boundingClientRect.bottom <= 0,
      );
    });
    observer.observe(profileHeader.current);
    return () => observer.disconnect();
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
  const did = profile?.did ?? (actor.startsWith("did:") ? actor : undefined);
  return (
    <>
      <SiteHeader />
      <main className="page-width py-12 sm:py-16">
        <div ref={profileHeader} className="publisher-identity">
          <div className="publisher-avatar" aria-hidden="true">
            {avatar && !failedAvatar ? (
              <img
                src={avatar}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatar(true)}
              />
            ) : (
              <UserIcon />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-medium tracking-tight sm:text-3xl">
              {name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-sm text-muted">
              <a
                className="break-all transition-colors hover:text-ink"
                href={`https://bsky.app/profile/${encodeURIComponent(identity)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {identity.startsWith("did:") ? identity : `@${identity}`}
              </a>
              {did && (
                <a
                  className="text-link text-xs"
                  href={`https://pdsls.dev/at://${did}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  PDSls <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
            {totalDownloads !== undefined && (
              <p
                className="mt-4 font-mono text-sm text-muted"
                aria-label={`${totalDownloads.toLocaleString()} total downloads`}
              >
                <DownloadIcon /> {totalDownloads.toLocaleString()} total
                downloads
              </p>
            )}
            {profile?.description && (
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted">
                {profile.description}
              </p>
            )}
          </div>
        </div>
        <section aria-label="Published modules" className="mt-12">
          <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 bg-paper py-5">
            <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto sm:flex-1">
              {showPinnedIdentity && (
                <div
                  aria-label="Pinned publisher"
                  className="flex min-w-0 flex-1 items-center gap-2.5 sm:max-w-64"
                >
                  <div
                    className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-raised text-sm text-accent"
                    aria-hidden="true"
                  >
                    {avatar && !failedAvatar ? (
                      <img
                        src={avatar}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                        onError={() => setFailedAvatar(true)}
                      />
                    ) : (
                      <UserIcon />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <a
                      className="block truncate font-mono text-xs text-muted hover:text-ink"
                      href={`https://bsky.app/profile/${encodeURIComponent(identity)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {identity.startsWith("did:") ? identity : `@${identity}`}
                    </a>
                  </div>
                </div>
              )}
              <div
                role="tablist"
                aria-label="Profile modules"
                className="flex items-center gap-5"
              >
                {(["modules", "likes"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => {
                      setTab(value);
                      setSearch("");
                    }}
                    className={`text-lg font-medium transition-colors ${tab === value ? "text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {value === "modules" ? "Modules" : "Likes"}
                    {(value === "modules" ? total : liked.total) !==
                      undefined && (
                      <span
                        className="ml-2 rounded-md bg-raised px-2 py-1 font-mono text-sm tabular-nums text-muted"
                        aria-label={`${value === "modules" ? total : liked.total} ${value === "modules" ? "published modules" : "liked modules"}`}
                      >
                        {(value === "modules"
                          ? total
                          : liked.total
                        )?.toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <label className="publisher-filter">
                <SearchIcon />
                <span className="sr-only">Filter published modules</span>
                <input
                  ref={filterInput}
                  type="search"
                  aria-keyshortcuts="f"
                  placeholder="Filter modules…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setSearch("");
                      event.currentTarget.blur();
                    }
                  }}
                  autoComplete="off"
                />
                <kbd
                  className="rounded border border-line px-1.5 font-mono text-[10px]"
                  aria-hidden="true"
                >
                  F
                </kbd>
              </label>
              <label className="w-full sm:w-auto">
                <span className="sr-only">Sort modules</span>
                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as ModuleSort)
                  }
                  className="h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
                >
                  <option value="downloads">Most downloaded</option>
                  <option value="newest">Recently published</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </label>
            </div>
          </div>
          <div className="publisher-modules" aria-busy={loading}>
            {items.map((plugin) => (
              <article
                key={`${plugin.author}/${plugin.name}`}
                className="publisher-module relative"
              >
                <ModuleLogo plugin={plugin} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      to="/$handle/plugin/$rkey"
                      params={{
                        handle: profile?.handle ?? plugin.author,
                        rkey: recordKey(plugin),
                      }}
                      className="after:absolute after:inset-0"
                      aria-label={`${plugin.name} ${plugin.description ?? ""}`}
                    >
                      <h3 className="text-base font-medium text-ink">
                        {plugin.name}
                      </h3>
                    </Link>
                    <div className="relative z-10 flex shrink-0 items-center gap-3">
                      {(plugin.downloads ?? 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-1.5 font-mono text-sm text-muted"
                          aria-label={`${plugin.downloads!.toLocaleString()} downloads`}
                        >
                          <DownloadIcon />
                          {plugin.downloads!.toLocaleString()}
                        </span>
                      )}
                      <LikeButton plugin={plugin} />
                    </div>
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
              </article>
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
      <ScrollToTop />
    </>
  );
}
