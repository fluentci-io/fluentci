import { expect, test } from "@playwright/test";
import { author, plugin } from "../src/fixtures/registry";

test("publisher handles and DIDs show identity, exact totals, infinite pages and server filtering", async ({
  page,
}) => {
  const profile = {
    ...author,
    displayName: "FluentCI",
    description: "Pipelines for developers.",
    avatar: "http://127.0.0.1:4173/fluentci-logo.png",
  };
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?*",
    (route) => route.fulfill({ json: profile }),
  );
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
    (route) => route.fulfill({ json: { profiles: [profile] } }),
  );
  const modules = Array.from({ length: 22 }, (_, index) => ({
    ...plugin,
    name: `module-${index}`,
    uri: `at://${author.did}/io.fluentci.plugin/module-${index}-0.1.0`,
  }));
  const requests: URL[] = [];
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.*",
    (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("getActorPackages"))
        return route.fulfill({ json: { packages: [plugin] } });
      requests.push(url);
      const filtered = Boolean(url.searchParams.get("q"));
      const cursor = url.searchParams.get("cursor");
      return route.fulfill({
        json: {
          packages: filtered
            ? [modules[21]]
            : cursor
              ? modules.slice(20)
              : modules.slice(0, 20),
          total: 22,
          ...(!filtered && !cursor ? { cursor: "next-page" } : {}),
        },
      });
    },
  );
  await page.goto("/fluentci.io");
  await expect(
    page.getByRole("heading", { name: "FluentCI", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("@fluentci.io", { exact: true })).toBeVisible();
  const bluesky = page.getByRole("link", { name: "@fluentci.io", exact: true });
  await expect(bluesky).toHaveAttribute(
    "href",
    "https://bsky.app/profile/fluentci.io",
  );
  await expect(bluesky).toHaveAttribute("target", "_blank");
  const pdsls = page.getByRole("link", { name: "PDSls", exact: true });
  await expect(pdsls).toHaveAttribute(
    "href",
    `https://pdsls.dev/at://${author.did}`,
  );
  await expect(pdsls).toHaveAttribute("target", "_blank");
  await expect(page.getByLabel("22 published modules")).toBeVisible();
  await expect(page.locator(".publisher-avatar img")).toHaveAttribute(
    "src",
    "http://127.0.0.1:4173/fluentci-logo.png",
  );
  const pinnedIdentity = page.getByLabel("Pinned publisher");
  await expect(pinnedIdentity).toHaveCount(0);
  await page.getByRole("link", { name: /module-19 / }).scrollIntoViewIfNeeded();
  await expect(pinnedIdentity).toBeVisible();
  await expect(pinnedIdentity).toContainText("FluentCI");
  await expect(pinnedIdentity).toContainText("@fluentci.io");
  await expect(pinnedIdentity.locator("img")).toHaveAttribute(
    "src",
    profile.avatar,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await expect(page.getByRole("link", { name: /module-21 / })).toBeVisible();
  const filter = page.getByRole("searchbox", {
    name: "Filter published modules",
  });
  await expect
    .poll(async () =>
      Math.abs((await filter.locator("..").locator("..").boundingBox())!.y),
    )
    .toBeLessThan(1);
  expect(
    requests.some((url) => url.searchParams.get("cursor") === "next-page"),
  ).toBeTruthy();
  await page.keyboard.press("f");
  await expect(filter).toBeFocused();
  await filter.fill("module-21");
  await expect(
    page.locator(".publisher-module").filter({ has: page.locator("h3") }),
  ).toHaveCount(1);
  await expect(page.getByLabel("22 published modules")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("q")).toBe("module-21");
  expect(requests.at(-1)?.searchParams.get("latest")).toBe("true");
  await page.keyboard.press("f");
  await expect(filter).toHaveValue("module-21f");
  await page.keyboard.press("Escape");
  await expect(filter).toHaveValue("");
  await expect(filter).not.toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(pinnedIdentity).toHaveCount(0);
  await page.goto(`/${author.did}`);
  await expect(
    page.getByRole("heading", { name: "FluentCI", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("actor"))
    .toBe(author.did);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("publisher empty and failure states remain retryable", async ({
  page,
}) => {
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?*",
    (route) => route.fulfill({ status: 404, json: {} }),
  );
  let fail = true;
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.*",
    (route) => {
      if (!route.request().url().includes("getActorPackages"))
        return route.fulfill({ json: { packages: [] } });
      return fail
        ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
        : route.fulfill({ json: { packages: [], total: 0 } });
    },
  );
  await page.goto("/someone.example");
  await expect(page.getByRole("alert")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No published modules yet.")).toBeVisible();
  await expect(page.getByLabel("0 published modules")).toBeVisible();
});
