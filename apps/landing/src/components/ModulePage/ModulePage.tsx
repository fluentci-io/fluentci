import { useEffect, useRef, useState } from "react";
import {
  Link,
  useParams,
  useRouter,
  useCanGoBack,
} from "@tanstack/react-router";
import { ModulePageSkeleton } from "../ModulePageSkeleton";
import { SiteHeader } from "../SiteHeader";
import { Author } from "../Author";
import { ModuleLogo } from "../ModuleLogo";
import { ModuleDocumentation } from "../ModuleDocumentation";
import { VersionSelector } from "../VersionSelector";
import { Downloads } from "../Downloads";
import { DownloadIcon } from "../DownloadIcon";
import { CopyCommand } from "../CopyCommand";
import { FunctionSearch } from "../FunctionSearch";
import {
  getPlugin,
  getProfiles,
  httpUrl,
  moduleTitle,
  query,
  runCommand,
  type Plugin,
  type Profile,
} from "../../registry/client";

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(parsed);
}

export function ModulePage() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { handle = "", rkey = "" } = useParams({ strict: false });
  const [plugin, setPlugin] = useState<Plugin>();
  const [latest, setLatest] = useState<Plugin>();
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [functionQuery, setFunctionQuery] = useState("");
  const [functionSearchActive, setFunctionSearchActive] = useState(false);
  const functionInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusFunctions = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "f" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      if (functionInput.current) {
        event.preventDefault();
        functionInput.current.focus();
      }
    };
    document.addEventListener("keydown", focusFunctions);
    return () => document.removeEventListener("keydown", focusFunctions);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setPlugin(undefined);
    setLatest(undefined);
    setProfile(undefined);
    setError("");
    setFunctionQuery("");
    setFunctionSearchActive(false);
    void (async () => {
      try {
        const item = await getPlugin(handle, rkey, abort.signal);
        if (abort.signal.aborted) return;
        setPlugin(item);
        void getProfiles([item.author], abort.signal)
          .then((profiles) => {
            if (!abort.signal.aborted) setProfile(profiles[item.author]);
          })
          .catch(() => {});
        void query<{ packages: Plugin[] }>(
          "searchPackages",
          new URLSearchParams({
            author: item.author,
            filter: `name==${item.name}`,
            latest: "true",
          }),
          abort.signal,
        )
          .then((result) => {
            if (!abort.signal.aborted)
              setLatest(
                result.packages.find(
                  (release) =>
                    release.author === item.author &&
                    release.name === item.name,
                ),
              );
          })
          .catch(() => {});
      } catch (reason) {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load this module.",
          );
      }
    })();
    return () => abort.abort();
  }, [handle, rkey, retry]);
  const author = profile?.handle ?? handle;
  useEffect(() => {
    document.title = plugin
      ? `${moduleTitle(plugin, author)} · FluentCI`
      : "Module · FluentCI";
    return () => {
      document.title = "FluentCI — Strongly typed. Functional CI/CD.";
    };
  }, [plugin, author]);
  const repository = httpUrl(plugin?.repository);
  return (
    <>
      <SiteHeader />
      <main className="page-width py-10 sm:py-16" id="main">
        <button
          type="button"
          className="nav-link text-xs"
          onClick={() => {
            if (canGoBack) router.history.back();
            else void router.navigate({ to: "/" });
          }}
        >
          {canGoBack ? "← Back" : "← Back to FluentCI"}
        </button>
        {error ? (
          <div className="py-20" role="alert">
            <h1 className="text-2xl">Unable to open module</h1>
            <p className="mt-4 text-muted">{error}</p>
            <button
              className="copy-button mt-6"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : !plugin ? (
          <ModulePageSkeleton />
        ) : (
          <div className="module-page-grid mt-10">
            <article className="min-w-0">
              <div className="flex items-center gap-5">
                <ModuleLogo key={plugin.logo} plugin={plugin} large />
                <div className="min-w-0">
                  <p className="section-label mb-2">
                    {author.toLowerCase() === "fluentci.io"
                      ? "Official module"
                      : "Community module"}
                  </p>
                  <h1 className="break-words text-2xl tracking-tight sm:text-4xl">
                    {moduleTitle(plugin, author)}
                  </h1>
                </div>
              </div>
              {plugin.description && (
                <p className="mt-7 text-base leading-8 text-muted">
                  {plugin.description}
                </p>
              )}
              {(latest?.downloads ?? 0) > 0 && (
                <p className="mt-4 font-mono text-sm text-muted">
                  <DownloadIcon /> {latest!.downloads!.toLocaleString()} total
                  downloads
                </p>
              )}
              <div
                className="mt-5 flex flex-wrap gap-2"
                aria-label="Module topics and platforms"
              >
                {[
                  ["Topic", plugin.topics],
                  ["OS", plugin.os],
                  ["CPU", plugin.arch],
                ].flatMap(
                  ([label, values]) =>
                    (values as string[] | undefined)?.map((value) => (
                      <span className="module-tag" key={`${label}-${value}`}>
                        <span className="text-muted">{label}</span> {value}
                      </span>
                    )) ?? [],
                )}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4 border-y border-line py-5">
                <Link
                  to="/$handle"
                  params={{ handle: author }}
                  className="nav-link"
                >
                  <Author
                    key={plugin.author}
                    profile={profile}
                    fallback={author}
                  />
                </Link>
                <span className="text-xs text-muted">
                  License{" "}
                  <span className="ml-2 text-ink">{plugin.license}</span>
                </span>
                {repository && (
                  <a className="text-link text-xs break-all" href={repository}>
                    Git repository ↗
                  </a>
                )}
              </div>
              <ModuleDocumentation
                key={plugin.uri}
                plugin={plugin}
                handle={author}
                query={functionQuery}
                showDocs={functionSearchActive}
              />
            </article>
            <aside className="module-usage-panel" aria-label="Module usage">
              <FunctionSearch
                value={functionQuery}
                onChange={setFunctionQuery}
                onFocus={() => setFunctionSearchActive(true)}
                onBlur={() => setFunctionSearchActive(false)}
                inputRef={functionInput}
              />
              <h2 className="text-lg">Use this module</h2>
              <p className="mt-3 text-xs leading-6 text-muted">
                Run directly from the registry.
              </p>
              <CopyCommand
                command={runCommand(
                  plugin,
                  author,
                  plugin.functions?.[0]?.name,
                )}
              />
              <dl className="my-6 space-y-4 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted">Version</dt>
                  <dd>
                    <VersionSelector
                      key={plugin.uri}
                      plugin={plugin}
                      handle={author}
                    />
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted">Published (UTC)</dt>
                  <dd>
                    <time dateTime={plugin.publishedAt}>
                      {date(plugin.publishedAt)}
                    </time>
                  </dd>
                </div>
                {latest && (
                  <>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-muted">Latest version</dt>
                      <dd>
                        <Link
                          className="text-accent font-mono"
                          to="/$handle/plugin/$rkey"
                          params={{
                            handle: author,
                            rkey: latest.uri.split("/").pop()!,
                          }}
                        >
                          {latest.version}
                        </Link>
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-muted">Latest published (UTC)</dt>
                      <dd>
                        <time dateTime={latest.publishedAt}>
                          {date(latest.publishedAt)}
                        </time>
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              <Downloads plugin={plugin} />
              <a
                className="mt-6 inline-block text-link text-xs"
                href="https://docs.fluentci.io"
              >
                CLI documentation ↗
              </a>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
