import { Link } from "@tanstack/react-router";
import {
  moduleTitle,
  recordKey,
  type Plugin,
  type Profile,
} from "../../registry/client";
import { ModuleLogo } from "../ModuleLogo";
import { Author } from "../Author";
import { DownloadIcon } from "../DownloadIcon";
export function ModuleCard({
  plugin,
  profile,
}: {
  plugin: Plugin;
  profile?: Profile;
}) {
  const handle = profile?.handle ?? plugin.author;
  const title = moduleTitle(plugin, handle);
  return (
    <article className="catalog-card">
      <Link
        to="/$handle/plugin/$rkey"
        params={{ handle, rkey: recordKey(plugin) }}
        className="flex min-w-0 items-center gap-3"
        title={title}
      >
        <ModuleLogo plugin={plugin} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          <p className="mt-1 font-mono text-xs text-muted">v{plugin.version}</p>
        </div>
      </Link>
      <p className="mt-4 line-clamp-2 min-h-12 text-xs leading-6 text-muted">
        {plugin.description}
      </p>
      <div className="mt-4 flex min-h-5 flex-wrap gap-1.5">
        {plugin.topics?.slice(0, 3).map((topic) => (
          <span
            key={topic}
            className="max-w-full truncate rounded bg-raised px-2 py-1 text-[10px] text-muted"
          >
            {topic}
          </span>
        ))}
      </div>
      <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-line pt-4">
        <Link className="min-w-0 text-xs" to="/$handle" params={{ handle }}>
          <Author profile={profile} fallback={plugin.author} />
        </Link>
        {(plugin.downloads ?? 0) > 0 && (
          <span
            className="shrink-0 font-mono text-xs text-muted"
            aria-label={`${plugin.downloads!.toLocaleString()} downloads`}
          >
            <DownloadIcon />
            {plugin.downloads!.toLocaleString()}
          </span>
        )}
      </div>
    </article>
  );
}
