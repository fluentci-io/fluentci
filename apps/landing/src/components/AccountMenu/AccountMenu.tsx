import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "../../auth/context";
import { httpUrl } from "../../registry/client";

export function AccountMenu() {
  const { account, loading, openSignIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!account) return <button type="button" className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60" disabled={loading} onClick={openSignIn}>Sign In</button>;
  const profile = account.profile;
  const handle = profile?.handle ?? account.did;
  const avatar = httpUrl(profile?.avatar);
  const picture = <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-sm text-ink">{avatar && !failed ? <img className="size-full object-cover" src={avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : handle.slice(0, 1).toUpperCase()}</span>;
  return <div className="relative" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className="block rounded-full" aria-label="Account menu" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{picture}</button>
    {open && <div className="absolute right-0 top-full z-40 mt-3 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-panel shadow-xl" aria-label="Account">
      <Link ref={first} className="flex items-center gap-3 p-4 transition-colors hover:bg-raised" to="/$handle" params={{ handle }} onClick={() => setOpen(false)}>{picture}<span className="min-w-0">{profile?.displayName && <span className="block truncate text-sm font-medium">{profile.displayName}</span>}<span className="block truncate text-xs text-muted">{handle.startsWith("did:") ? handle : `@${handle}`}</span></span></Link>
      <button type="button" className="w-full border-t border-line px-4 py-3 text-left text-xs hover:bg-raised" onClick={() => { setOpen(false); logout(); }}>Log out</button>
    </div>}
  </div>;
}
