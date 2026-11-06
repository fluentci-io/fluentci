import { setupWorker } from "msw/browser";
import { createMockApi } from "./handlers";

export async function enableMocking() {
  const api = createMockApi({
    stream: true,
    git:
      new URLSearchParams(location.search).get("fixture") === "git" ||
      new URLSearchParams(location.search).has("git"),
    noRuns: new URLSearchParams(location.search).get("fixture") === "git",
    largeLogs: new URLSearchParams(location.search).get("fixture") === "large",
  });
  const worker = setupWorker(...api.handlers);
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}
