export const accountKey = "fluentci-account";
const oauthPrefix = "fluentci-oauth:";
const sessionCookie = "fluentci-browser-session";

function hasBrowserSession() {
  return document.cookie
    .split("; ")
    .some((cookie) => cookie === `${sessionCookie}=1`);
}

export function beginBrowserSession() {
  document.cookie = `${sessionCookie}=1; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  if (!hasBrowserSession())
    throw Error("Allow browser storage and cookies to sign in.");
}

export function clearCredentials() {
  for (const key of Object.keys(localStorage))
    if (key.startsWith(oauthPrefix)) localStorage.removeItem(key);
}

export function endBrowserSession() {
  localStorage.removeItem(accountKey);
  document.cookie = `${sessionCookie}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function prepareBrowserSession() {
  if (!hasBrowserSession()) {
    localStorage.removeItem(accountKey);
    clearCredentials();
    // Upgrade an already authenticated tab, including a pending OAuth callback.
    const legacyKeys = Object.keys(sessionStorage).filter((key) =>
      key.startsWith(oauthPrefix),
    );
    const legacyAccount = sessionStorage.getItem(accountKey);
    if (legacyKeys.length) {
      for (const key of legacyKeys)
        localStorage.setItem(key, sessionStorage.getItem(key)!);
      if (legacyAccount) localStorage.setItem(accountKey, legacyAccount);
      beginBrowserSession();
    }
  }
  // Remove old tab-local credentials so logout cannot resurrect them later.
  for (const key of Object.keys(sessionStorage))
    if (key === accountKey || key.startsWith(oauthPrefix))
      sessionStorage.removeItem(key);
  return localStorage.getItem(accountKey);
}
