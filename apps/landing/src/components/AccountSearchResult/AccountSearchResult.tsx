import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { httpUrl, type Profile } from "../../registry/client";
import { UserIcon } from "../UserIcon";

export function AccountSearchResult({
  profile,
  index,
  selected,
  select,
  close,
}: {
  profile: Profile;
  index: number;
  selected: boolean;
  select: () => void;
  close: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const avatar = httpUrl(profile.avatar);
  return (
    <div role="option" aria-selected={selected} id={`module-result-${index}`}>
      <Link
        to="/$handle"
        params={{ handle: profile.handle }}
        className={`module-result ${selected ? "is-selected" : ""}`}
        data-result={index}
        tabIndex={-1}
        onMouseEnter={select}
        onClick={close}
      >
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-muted">
          {avatar && !failed ? (
            <img
              src={avatar}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          ) : (
            <UserIcon />
          )}
        </span>
        <span className="min-w-0 flex-1">
          {profile.displayName?.trim() && (
            <span className="block truncate text-sm text-ink">
              {profile.displayName}
            </span>
          )}
          <span
            className={`block truncate font-mono ${profile.displayName?.trim() ? "mt-1 text-xs text-muted" : "text-sm text-ink"}`}
          >
            @{profile.handle}
          </span>
        </span>
      </Link>
    </div>
  );
}
