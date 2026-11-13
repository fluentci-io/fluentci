import { expect, test, type Page } from "@playwright/test";
import { author, plugin } from "../src/fixtures/registry";

const endpoint =
  "https://api.fluentci.io/xrpc/io.fluentci.registry.searchPackages?*";
async function mockCommon(page: Page) {
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?*",
    (route) => route.fulfill({ json: { package: plugin } }),
  );
  await page.route("https://modules.example/README.md", (route) =>
    route.fulfill({ body: "# sccache", contentType: "text/markdown" }),
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.listPackages?*",
    (route) => route.fulfill({ json: { packages: [plugin] } }),
  );
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
    (route) => route.fulfill({ json: { profiles: [author] } }),
  );
}
async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: "Show filters" });
  if (await toggle.isVisible()) await toggle.click();
}

test("catalog navigation, themed skeletons, latest release cards, and cursor pagination", async ({
  page,
}) => {
  await mockCommon(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("latest")).toBe("true");
    expect(params.get("sort")).toBe("downloads");
    expect(params.get("limit")).toBe("24");
    await gate;
    const second = params.get("cursor") === "page-2";
    await route.fulfill({
      json: {
        packages: [
          {
            ...plugin,
            name: second ? "other-module" : "sccache",
            version: "0.2.1",
            uri: `at://${author.did}/io.fluentci.plugin/${second ? "other-module" : "sccache"}-0.2.1`,
          },
        ],
        cursor: second ? undefined : "page-2",
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Modules", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Modules for every pipeline." }),
  ).toBeVisible();
  const skeleton = page.getByRole("status", { name: "Loading modules" });
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator(".skeleton").first()).toHaveCSS(
    "animation-name",
    /skeleton/,
  );
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(skeleton).toBeVisible();
  release();
  const catalog = page.getByRole("region", { name: "Module catalog" });
  await expect(
    catalog.getByRole("link", { name: "sccache v0.2.1", exact: true }),
  ).toHaveAttribute("href", "/fluentci.io/plugin/sccache-0.2.1");
  await expect(catalog.getByLabel("1,284 downloads")).toBeVisible();
  await expect(
    catalog.getByRole("link", { name: "@fluentci.io" }),
  ).toHaveAttribute("href", "/fluentci.io");
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    catalog.getByRole("heading", { name: "other-module" }),
  ).toBeVisible();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    catalog.getByRole("heading", { name: "sccache", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("category and platform filters combine on the server and reset pagination", async ({
  page,
}) => {
  await mockCommon(page);
  const requests: URLSearchParams[] = [];
  await page.route(endpoint, (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    return route.fulfill({
      json: {
        packages: [plugin],
        cursor: params.has("cursor") ? undefined : "next-page",
      },
    });
  });
  await page.goto("/modules");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await openFilters(page);
  const filters = page.getByRole("complementary", { name: "Module filters" });
  await filters.getByRole("checkbox", { name: "Caching", exact: true }).check();
  await filters.getByRole("checkbox", { name: "Testing", exact: true }).check();
  await filters.getByRole("checkbox", { name: "Linux", exact: true }).check();
  await filters
    .getByRole("checkbox", { name: "ARM64 (aarch64)", exact: true })
    .check();
  await filters
    .getByRole("checkbox", { name: "Official modules only" })
    .check();
  await expect
    .poll(() => requests.at(-1)?.get("filter"))
    .toBe(
      "topics=in=(test,testing,lint,quality,cache,caching,sccache,cachix);os=in=(linux);arch=in=(aarch64)",
    );
  await expect.poll(() => requests.at(-1)?.get("author")).toBe("fluentci.io");
  expect(requests.at(-1)?.has("cursor")).toBe(false);
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search modules", exact: true })
    .fill("cache");
  await expect.poll(() => requests.at(-1)?.get("q")).toBe("cache");
  await page
    .getByRole("combobox", { name: "Sort modules" })
    .selectOption("newest");
  await expect.poll(() => requests.at(-1)?.get("sort")).toBe("newest");
  await page.reload();
  await openFilters(page);
  await expect(
    filters.getByRole("checkbox", { name: "Caching", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("searchbox", { name: "Search modules", exact: true }),
  ).toHaveValue("cache");
  await filters.getByRole("button", { name: "Clear all" }).click();
  await expect.poll(() => requests.at(-1)?.get("filter")).toBe(null);
  expect(requests.at(-1)?.get("q")).toBe("cache");
});

test("catalog supports retry and empty results without overflowing narrow screens", async ({
  page,
}) => {
  await mockCommon(page);
  let failed = true;
  await page.route(endpoint, (route) =>
    failed
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { packages: [] } }),
  );
  await page.goto("/modules?categories=unknown&os=linux&sort=invalid");
  await expect(page.getByRole("alert")).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No modules match");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await openFilters(page);
  await expect(
    page.getByRole("checkbox", { name: "Linux", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Sort modules" }),
  ).toHaveValue("downloads");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("recent catalog pages and filters are reused from the React Query cache", async ({
  page,
}) => {
  await mockCommon(page);
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    const filtered = new URL(route.request().url()).searchParams.has("filter");
    return route.fulfill({
      json: {
        packages: [{ ...plugin, name: filtered ? "cached-filter" : "sccache" }],
      },
    });
  });
  await page.goto("/modules");
  await expect(
    page.getByRole("heading", { name: "sccache", exact: true }),
  ).toBeVisible();
  const initialRequests = requests;
  await openFilters(page);
  await page.getByRole("checkbox", { name: "Caching", exact: true }).check();
  await expect(
    page.getByRole("heading", { name: "cached-filter", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(initialRequests + 1);
  await page.getByRole("checkbox", { name: "Caching", exact: true }).uncheck();
  await expect(
    page.getByRole("heading", { name: "sccache", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading modules" }),
  ).toHaveCount(0);
  expect(requests).toBe(initialRequests + 1);
  await page.getByRole("link", { name: "FluentCI home" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Modules", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "sccache", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(initialRequests + 1);
  await page
    .getByRole("region", { name: "Module catalog" })
    .getByRole("link", { name: "sccache v0.1.0", exact: true })
    .click();
  await expect(page).toHaveURL(/\/fluentci.io\/plugin\/sccache-0.1.0$/);
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(page).toHaveURL(/\/modules/);
  await expect(
    page.getByRole("heading", { name: "sccache", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading modules" }),
  ).toHaveCount(0);
});

test("a directly opened module falls back to home", async ({ page }) => {
  await mockCommon(page);
  await page.route(endpoint, (route) =>
    route.fulfill({ json: { packages: [plugin] } }),
  );
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  await page
    .getByRole("button", { name: "← Back to FluentCI", exact: true })
    .click();
  await expect(page).toHaveURL("/");
});

test("catalog result count follows pages and filtered totals", async ({
  page,
}) => {
  await mockCommon(page);
  await page.route(endpoint, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const filtered = params.get("q") === "missing";
    const second = params.has("cursor");
    const count = filtered ? 0 : second ? 3 : 24;
    return route.fulfill({
      json: {
        packages: Array.from({ length: count }, (_, i) => ({
          ...plugin,
          name: `result-${second ? 24 + i : i}`,
          uri: `at://${author.did}/io.fluentci.plugin/result-${second ? 24 + i : i}-0.1.0`,
        })),
        total: filtered ? 0 : 27,
        cursor: !filtered && !second ? "next-page" : undefined,
      },
    });
  });
  await page.goto("/modules");
  const count = page.getByLabel("Module result count");
  await expect(count).toHaveText("1 - 24 of 27 available modules");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(count).toHaveText("25 - 27 of 27 available modules");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(count).toHaveText("1 - 24 of 27 available modules");
  await page
    .getByRole("searchbox", { name: "Search modules", exact: true })
    .fill("missing");
  await expect(count).toHaveText("0 - 0 of 0 available modules");
});

test("grid compacts download and like counts while preserving exact totals", async ({
  page,
}) => {
  await mockCommon(page);
  const values = [999, 1000, 10000, 20500, 1000000, 10000000, 1000000000];
  await page.route(endpoint, (route) => {
    const name = new URL(route.request().url()).searchParams
      .get("filter")
      ?.replace("name==", "");
    const packages = values.map((downloads, i) => ({
      ...plugin,
      name: `compact-${i}`,
      uri: `at://${author.did}/io.fluentci.plugin/compact-${i}-0.1.0`,
      downloads,
      likesCount: downloads,
    }));
    return route.fulfill({
      json: {
        packages: name
          ? packages.filter((item) => item.name === name)
          : packages,
        total: values.length,
      },
    });
  });
  await page.goto("/modules");
  for (const [i, text] of [
    "999",
    "1K+",
    "10K+",
    "20K+",
    "1M+",
    "10M+",
    "1B+",
  ].entries()) {
    const card = page
      .locator(".catalog-card")
      .filter({
        has: page.getByRole("heading", { name: `compact-${i}`, exact: true }),
      });
    for (const kind of ["downloads", "likes"]) {
      const label = `${values[i].toLocaleString("en")} ${kind}`;
      const count = card.getByLabel(label, { exact: true });
      await expect(count).toHaveText(text);
      await expect(count).toHaveAttribute("title", label);
    }
  }
});
