import { expect, test } from "@playwright/test";
import { author, plugin } from "../src/fixtures/registry";

for (const path of ["/modules", "/fluentci.io"]) {
  test(`scroll-to-top button appears and returns ${path} to the top`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const packages = Array.from({ length: 24 }, (_, index) => ({
      ...plugin,
      name: `module-${index}`,
      uri: `at://${author.did}/io.fluentci.plugin/module-${index}-0.1.0`,
    }));
    await page.route(
      "https://api.fluentci.io/xrpc/io.fluentci.registry.*",
      (route) =>
        route.fulfill({ json: { packages, total: 24, totalDownloads: 100 } }),
    );
    await page.route(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
      (route) => route.fulfill({ json: { profiles: [author] } }),
    );
    await page.route(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?*",
      (route) => route.fulfill({ json: author }),
    );
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Scroll to top" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "module-0", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 600));
    const button = page.getByRole("button", { name: "Scroll to top" });
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS("position", "fixed");
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(button).toHaveCount(0);
  });
}
