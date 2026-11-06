import { useState } from "react";
import { httpUrl, type Profile } from "../../registry/client";

export function Author({
  profile,
  fallback,
}: {
  profile?: Profile;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  const handle = profile?.handle ?? fallback;
  const avatar = httpUrl(profile?.avatar);
  return (
    <span className="module-author" title={handle}>
      <span className="author-avatar">
        {avatar && !failed ? (
          <img
            src={avatar}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          handle.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="truncate">
        {handle.startsWith("did:") ? handle : `@${handle}`}
      </span>
    </span>
  );
}
