import { expect, test } from "@playwright/test";

test("PWA installs its static shell, stays usable offline, and excludes OAuth and API traffic", async ({ page, context }) => {
  await page.route("https://api.fluentci.io/**", (route) => route.fulfill({ json: { packages: [] } }));
  await page.goto("/");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone"); expect(manifest.start_url).toBe("/");
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src); expect(response.ok()).toBe(true);
    const png = await response.body(); const size = Number(icon.sizes.split("x")[0]);
    expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async () => {
    await fetch("/oauth-client-metadata.json");
    await fetch("/oauth/callback?code=private&state=private");
    await fetch("/xrpc/private", { headers: { authorization: "DPoP private" } });
  });
  const keys = await page.evaluate(async () => { const names = await caches.keys(); return (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat(); });
  expect(keys.some((url) => /oauth|xrpc|private/.test(url))).toBe(false);
  await context.setOffline(true);
  await page.goto("/modules");
  await expect(page.getByRole("heading", { name: "Modules for every pipeline." })).toBeVisible();
});
