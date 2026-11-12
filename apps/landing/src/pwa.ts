// A waiting update activates when the existing app tabs close, preserving each
// tab's OAuth session and in-progress interactions without a forced reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* The online site still works without offline support. */ });
  });
}
