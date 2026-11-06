import { useState } from "react";
import { httpUrl, type Plugin } from "../../registry/client";

export function ModuleLogo({
  plugin,
  large = false,
}: {
  plugin: Plugin;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = httpUrl(plugin.logo);
  return (
    <span className={`module-logo ${large ? "module-logo-large" : ""}`}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9" />
        </svg>
      )}
    </span>
  );
}
