import { httpUrl, type Profile } from "../../registry/client";
import { Skeleton } from "../Skeleton";
export function HandleSuggestions({ items, loading, active, select }: { items: Profile[]; loading: boolean; active: number; select: (profile: Profile) => void }) {
  return <div id="handle-suggestions" role="listbox" aria-label="Suggested accounts" className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-line bg-paper p-1">
    {loading ? <div role="status" aria-label="Searching accounts" className="flex items-center gap-3 p-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-4 w-36" /></div> : items.map((profile, index) => <button id={`handle-option-${index}`} type="button" role="option" aria-selected={index === active} key={profile.did} className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left ${index === active ? "bg-raised" : "hover:bg-raised"}`} onMouseDown={(event) => event.preventDefault()} onClick={() => select(profile)}>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-xs text-muted">{httpUrl(profile.avatar) ? <img className="size-full object-cover" src={httpUrl(profile.avatar)} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : profile.handle.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0">{profile.displayName && <span className="block truncate text-xs text-ink">{profile.displayName}</span>}<span className="block truncate text-xs text-muted">@{profile.handle}</span></span>
    </button>)}
  </div>;
}
