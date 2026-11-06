import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { SiteHeader } from "../SiteHeader";
import { Author } from "../Author";
import { ModuleLogo } from "../ModuleLogo";
import { Readme } from "../Readme";
import { Downloads } from "../Downloads";
import { DownloadIcon } from "../DownloadIcon";
import { CopyCommand } from "../CopyCommand";
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
  const { handle = "", rkey = "" } = useParams({ strict: false });
  const [plugin, setPlugin] = useState<Plugin>();
  const [latest, setLatest] = useState<Plugin>();
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setPlugin(undefined);
    setLatest(undefined);
    setProfile(undefined);
    setError("");
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
        void query<{ package: Plugin }>(
          "getPackage",
          new URLSearchParams({ author: item.author, name: item.name }),
          abort.signal,
        )
          .then((result) => {
            if (!abort.signal.aborted) setLatest(result.package);
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
        <Link to="/" className="nav-link text-xs">
          ← Back to FluentCI
        </Link>
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
          <p role="status" className="py-20 text-muted">
            Loading module…
          </p>
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
              {(plugin.downloads ?? 0) > 0 && (
                <p className="mt-4 font-mono text-sm text-muted">
                  <DownloadIcon /> {plugin.downloads!.toLocaleString()}{" "}
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
                <a
                  href={`https://bsky.app/profile/${encodeURIComponent(author)}`}
                  className="nav-link"
                >
                  <Author
                    key={plugin.author}
                    profile={profile}
                    fallback={author}
                  />
                </a>
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
              <Readme key={plugin.uri} plugin={plugin} />
              {Boolean(plugin.functions?.length) && (
                <section className="mt-10">
                  <h2 className="mb-5 text-lg">Functions</h2>
                  <div className="divide-y divide-line rounded-xl border border-line bg-panel px-5">
                    {plugin.functions?.map((job) => (
                      <div className="py-5" key={job.name}>
                        <code className="block break-words text-sm text-cyan">
                          {job.name}(
                          {job.args
                            ?.map((arg) => `${arg.name}: ${arg.type}`)
                            .join(", ") ?? "…"}
                          ){job.returnType ? ` → ${job.returnType}` : ""}
                        </code>
                        {job.description && (
                          <p className="mt-2 text-sm text-muted">
                            {job.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </article>
            <aside className="module-usage-panel" aria-label="Module usage">
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
                  <dd className="font-mono">{plugin.version}</dd>
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
