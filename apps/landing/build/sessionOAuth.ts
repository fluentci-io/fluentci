import type { Plugin } from "vite";

// atcute 5.1.0 hardcodes localStorage. Adapt only its private OAuth store,
// including state, DPoP keys/nonces and sessions, to tab-scoped sessionStorage.
// Exclude it from dependency prebundling so this hook also runs in development.
export function sessionOAuth(): Plugin {
  return {
    name: "fluentci-session-oauth",
    enforce: "pre",
    transform(code, id) {
      if (
        !id
          .split("?")[0]
          .endsWith("/@atcute/oauth-browser-client/dist/store/db.js")
      )
        return;
      if (
        !code.includes("localStorage") ||
        !code.includes("new BroadcastChannel(`${name}:sync`)")
      )
        throw Error("Review atcute OAuth storage adapter after upgrading.");
      return {
        code: code
          .replace(/\blocalStorage\b/g, "sessionStorage")
          .replace(
            "new BroadcastChannel(`${name}:sync`)",
            "new BroadcastChannel(`${name}:sync:${crypto.randomUUID()}`)",
          ),
        map: null,
      };
    },
  };
}
