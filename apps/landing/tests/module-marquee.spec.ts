import { expect, test } from "@playwright/test";
import { author, plugin } from "../src/fixtures/registry";

async function registry(page: import("@playwright/test").Page) {
  const modules = Array.from({ length: 20 }, (_, index) => ({
    ...plugin,
    name: `module-${String(index).padStart(2, "0")}`,
    uri: `at://${author.did}/io.fluentci.plugin/module-${String(index).padStart(2, "0")}-0.1.0`,
    downloads: 1000 - index,
    logo: index % 2 ? undefined : "/fluentci-logo.png",
  }));
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.listPackages?*",
    (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("sort")).toBe("downloads");
      expect(url.searchParams.get("latest")).toBe("true");
      expect(url.searchParams.get("limit")).toBe("20");
      return route.fulfill({ json: { packages: modules } });
    },
  );
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
    (route) => route.fulfill({ json: { profiles: [author] } }),
  );
}

async function position(page: import("@playwright/test").Page) {
  return page
    .getByLabel("Scroll popular modules")
    .evaluate((element) => element.scrollLeft);
}

test("top module logos scroll, pause on hover and focus, and link to releases", async ({
  page,
}) => {
  await registry(page);
  await page.goto("/");
  const list = page.getByRole("list", { name: "Most downloaded modules" });
  await expect(list.getByRole("link")).toHaveCount(20);
  await expect(list.getByRole("link").first()).toContainText("module-00");
  const viewport = page.getByLabel("Scroll popular modules");
  await viewport.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await expect.poll(() => position(page)).toBeGreaterThan(5);
  await viewport.hover();
  await page.waitForTimeout(100);
  const hovered = await position(page);
  await page.waitForTimeout(200);
  expect(Math.abs((await position(page)) - hovered)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Pause module animation" }).click();
  await page.mouse.move(1, 1);
  const paused = await position(page);
  await page.waitForTimeout(200);
  expect(Math.abs((await position(page)) - paused)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Resume module animation" }).click();
  await viewport.focus();
  await page.waitForTimeout(100);
  const focused = await position(page);
  await page.waitForTimeout(200);
  expect(Math.abs((await position(page)) - focused)).toBeLessThanOrEqual(1);
  await expect(viewport).toHaveCSS("mask-image", /linear-gradient/);
  const link = list.getByRole("link", { name: "Open module-01", exact: true });
  await expect(link).toHaveAttribute(
    "href",
    "/fluentci.io/plugin/module-01-0.1.0",
  );
  await expect(list.locator(".module-logo").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await link.click();
  await expect(page).toHaveURL(/\/fluentci.io\/plugin\/module-01-0.1.0$/);
});

test("reduced motion keeps module scrolling manual in both themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await registry(page);
  await page.goto("/");
  const viewport = page.getByLabel("Scroll popular modules");
  await viewport.scrollIntoViewIfNeeded();
  await expect(
    page
      .getByRole("list", { name: "Most downloaded modules" })
      .getByRole("link"),
  ).toHaveCount(20);
  await expect(
    page.getByRole("button", { name: "Pause module animation" }),
  ).toHaveCount(0);
  const start = await position(page);
  await page.waitForTimeout(250);
  expect(await position(page)).toBe(start);
  await viewport.evaluate((element) => {
    element.scrollLeft = 200;
  });
  await page.waitForTimeout(200);
  expect(await position(page)).toBe(200);
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await viewport.scrollIntoViewIfNeeded();
  await expect(viewport).toHaveCSS("mask-image", /linear-gradient/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
