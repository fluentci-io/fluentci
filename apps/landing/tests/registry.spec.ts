import { expect, test } from "@playwright/test";
import { plugin, author, typedPlugin } from "../src/fixtures/registry";

async function registry(
  page: import("@playwright/test").Page,
  readmeStatus = 200,
  history = true,
) {
  const community = {
    ...plugin,
    name: "cache",
    author: "did:plc:zyxwvutsrqponmlkjihgfedcb",
    uri: "at://did:plc:zyxwvutsrqponmlkjihgfedcb/io.fluentci.plugin/cache-0.1.0",
    logo: undefined,
    downloads: 0,
  };
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.*",
    (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        json: url.pathname.endsWith("getPackage")
          ? {
              package: {
                ...plugin,
                dailyDownloads: history ? plugin.dailyDownloads : undefined,
              },
            }
          : {
              packages:
                url.searchParams.get("q") === "missing"
                  ? []
                  : [plugin, community],
            },
      });
    },
  );
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
    (route) =>
      route.fulfill({
        json: {
          profiles: [
            author,
            { did: community.author, handle: "alice.example" },
          ],
        },
      }),
  );
  await page.route("https://modules.example/README.md", (route) =>
    route.fulfill({
      status: readmeStatus,
      contentType: "text/markdown",
      body: "# Compiler cache\n\nUse **sccache** in a pipeline.\n\n[Source](https://github.com/fluentci-io/fluentci)\n\n<script>alert('unsafe')</script>",
    }),
  );
}

test("search opens with slash, shows identities and navigates to the record page", async ({
  page,
}) => {
  await registry(page);
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const name of ["GitHub", "Discord", "Bluesky", "Tangled"]) {
    await expect(
      navigation.getByRole("link", { name, exact: true }),
    ).toHaveText("");
  }
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search FluentCI modules" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => getComputedStyle(element, "::backdrop").backdropFilter,
    ),
  ).toBe("none");
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  const result = dialog.getByRole("link", { name: /sccache/ });
  await expect(
    result.getByLabel("1,284 downloads", { exact: true }),
  ).toHaveText("1,284");
  await expect(result).not.toContainText("downloads");
  await expect(dialog.getByRole("link", { name: /sccache/ })).toContainText(
    "@fluentci.io",
  );
  await expect(dialog.getByRole("link", { name: /sccache/ })).not.toContainText(
    "@fluentci.io/sccache",
  );
  await expect(
    dialog.getByRole("link", { name: /@alice.example\/cache/ }),
  ).not.toContainText("downloads");
  const resultLogo = dialog
    .getByRole("link", { name: /sccache/ })
    .locator(".module-logo");
  await expect(resultLogo).toHaveCSS("width", "72px");
  expect(
    await resultLogo.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBe(72);
  await input.fill("missing");
  await expect(dialog.getByRole("status")).toHaveText(
    "No modules found. Try another name or topic.",
  );
  await input.fill("sccache");
  await expect(dialog.getByRole("link", { name: /sccache/ })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /sccache/ })).toHaveAttribute(
    "href",
    "/fluentci.io/plugin/sccache-0.1.0",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fluentci.io\/plugin\/sccache-0.1.0$/);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sccache");
  await expect(page.getByText("Official module")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Module README" }),
  ).toContainText("Compiler cache");
  await expect(page.locator("main script")).toHaveCount(0);
  const usage = page.getByRole("complementary", { name: "Module usage" });
  await expect(usage).toContainText("fluentci run sccache@0.1.0 setup");
  await expect(usage).toContainText("Latest version");
  await expect(usage).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(usage).toHaveCSS("border-top-width", "0px");
  await expect(
    usage.getByRole("img", { name: "227 downloads in the last 7 days" }),
  ).toBeVisible();
  const chart = usage.getByRole("img", {
    name: "227 downloads in the last 7 days",
  });
  await chart.hover();
  await expect(usage.getByRole("tooltip")).toContainText("42 downloads");
  await chart.focus();
  await chart.press("Home");
  await expect(usage.getByRole("tooltip")).toContainText("14 downloads");
  await chart.press("End");
  await expect(usage.getByRole("tooltip")).toContainText("38 downloads");
  await expect(chart.locator(".download-cursor")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Git repository" }),
  ).toHaveAttribute("href", plugin.repository!);
  await expect(page.getByLabel("Module topics and platforms")).toContainText(
    "aarch64",
  );
  await usage.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(usage.getByRole("status")).toHaveText("Copied");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sccache");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Escape restores focus and absent README/history stay hidden", async ({
  page,
}) => {
  await registry(page, 404, false);
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sccache");
  await expect(page.getByRole("region", { name: "Module README" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Weekly downloads" }),
  ).toHaveCount(0);
  await expect(page.getByText(/history is|unavailable yet/i)).toHaveCount(0);
  const trigger = page.getByRole("button", {
    name: "Search module",
    exact: true,
  });
  await trigger.click();
  await page.getByRole("combobox").fill("/");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("search failure is visible and a later query can recover", async ({
  page,
}) => {
  await registry(page);
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.listPackages?*",
    (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Search module", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "registry is unavailable",
  );
  await page.getByRole("combobox").fill("cache");
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /sccache/ }),
  ).toBeVisible();
});

test("initial results preload once and reopen immediately from the cache", async ({
  page,
}) => {
  await registry(page);
  let requests = 0;
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.listPackages?*",
    async (route) => {
      requests++;
      await route.fulfill({ json: { packages: [plugin] } });
    },
  );
  const enriched = page.waitForResponse((response) =>
    response.url().includes("getProfiles"),
  );
  await page.goto("/");
  await expect.poll(() => requests).toBe(1);
  // Wait for enrichment to complete so the first open also has author identity.
  await enriched;
  const trigger = page.getByRole("button", {
    name: "Search module",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog").locator(".skeleton")).toHaveCount(0);
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /sccache/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await trigger.click();
  await expect(page.getByRole("dialog").locator(".skeleton")).toHaveCount(0);
  expect(requests).toBe(1);
});

test("loading skeletons follow the theme and reduced motion setting", async ({
  page,
}) => {
  await registry(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.listPackages?*",
    async (route) => {
      await pending;
      await route.fulfill({ json: { packages: [plugin] } });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page
    .getByRole("button", { name: "Search module", exact: true })
    .click();
  const skeleton = page.getByRole("dialog").locator(".skeleton").first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveCSS("animation-name", "skeleton-shimmer");
  await expect(skeleton).toHaveCSS("background-color", "rgb(241, 240, 246)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(skeleton).toHaveCSS("animation-name", "none");
  release();
  await expect(page.getByRole("dialog").locator(".skeleton")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("module pages show a skeleton while their record loads", async ({
  page,
}) => {
  await registry(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?*",
    async (route) => {
      await pending;
      await route.fulfill({ json: { package: plugin } });
    },
  );
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  await expect(
    page.getByRole("status", { name: "Loading module" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status", { name: "Loading module" })
      .locator(".skeleton")
      .first(),
  ).toHaveCSS("animation-name", "skeleton-shimmer");
  release();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sccache");
  await expect(
    page.getByRole("status", { name: "Loading module" }),
  ).toHaveCount(0);
});

test("README code supports non-SDK languages with dark and light syntax themes", async ({
  page,
}) => {
  await registry(page);
  const readme =
    "# Syntax samples\n\n```sql\nSELECT * FROM packages WHERE name = 'cache';\n```\n\n```nginx\nserver { listen 443 ssl; }\n```\n\n```ruby\ndef hello\n  puts \"world\"\nend\n```\n\n```unknown\n<script>not executed</script>\n```";
  await page.route("https://modules.example/README.md", (route) =>
    route.fulfill({ contentType: "text/markdown", body: readme }),
  );
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  const markdown = page.getByRole("region", { name: "Module README" });
  for (const language of ["sql", "nginx", "ruby"]) {
    await expect(
      markdown
        .locator(`code.language-${language} span[class*="hljs-"]`)
        .first(),
    ).toBeVisible();
  }
  const keyword = markdown.locator("code.language-sql .hljs-keyword").first();
  await expect(keyword).toHaveCSS("color", "rgb(255, 122, 178)");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(keyword).toHaveCSS("color", "rgb(180, 35, 119)");
  await expect(markdown.locator("code.language-unknown")).toHaveText(
    "<script>not executed</script>\n",
  );
  await expect(markdown.locator("script")).toHaveCount(0);
});

test("Docs tab shows the exposed function count, typed arguments, descriptions, and returns", async ({
  page,
}) => {
  await registry(page);
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?*",
    (route) => route.fulfill({ json: { package: typedPlugin } }),
  );
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  const tabs = page.getByRole("tablist", { name: "Module documentation" });
  const readme = tabs.getByRole("tab", { name: "README" });
  const docs = tabs.getByRole("tab", { name: "Docs 2", exact: true });
  await expect(readme).toHaveAttribute("aria-selected", "true");
  await readme.focus();
  await page.keyboard.press("ArrowRight");
  await expect(docs).toBeFocused();
  await expect(docs).toHaveAttribute("aria-selected", "true");
  const build = page.getByRole("region", {
    name: "build function",
    exact: true,
  });
  await expect(build).toContainText("--src");
  await expect(build).toContainText(
    "Directory containing the project sources.",
  );
  await expect(build).toContainText("--verbose");
  await expect(build).toContainText("optional");
  await expect(build).toContainText("Result(string, BuildError)");
  await expect(build).toContainText(
    "fluentci run sccache@0.1.0 build --src demo --jobs 1",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Module functions" })
      .getByRole("link", { name: "clean" }),
  ).toHaveAttribute("href", "#function-1");
  const before = await build
    .locator(".module-type-string")
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  const after = await build
    .locator(".module-type-string")
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  expect(after).not.toBe(before);
  await docs.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(readme).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Module README" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("WIT component Docs show named flags and native return types", async ({
  page,
}) => {
  await registry(page);
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?*",
    (route) =>
      route.fulfill({
        json: {
          package: {
            ...typedPlugin,
            functions: typedPlugin.functions.map((fn) => ({
              ...fn,
              inputFormat: "wit",
            })),
          },
        },
      }),
  );
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  await page.getByRole("tab", { name: "Docs 2", exact: true }).click();
  const build = page.getByRole("region", {
    name: "build function",
    exact: true,
  });
  await expect(build).toContainText("--src");
  await expect(build).toContainText("--verbose");
  await expect(build).toContainText("Result(string, BuildError)");
});

test("F focuses function search and filters Docs without changing the exposed count", async ({
  page,
}) => {
  await registry(page);
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?*",
    (route) => route.fulfill({ json: { package: typedPlugin } }),
  );
  await page.goto("/fluentci.io/plugin/sccache-0.1.0");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sccache");
  await page.keyboard.press("f");
  const search = page.getByPlaceholder("Search for functions", { exact: true });
  await expect(search).toBeFocused();
  await search.fill("build");
  await expect(
    page.getByRole("tab", { name: "Docs 2", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: "build function", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "clean function", exact: true }),
  ).toHaveCount(0);
  await search.fill("remove");
  await expect(
    page.getByRole("region", { name: "clean function", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "build function", exact: true }),
  ).toHaveCount(0);
  await search.fill("missing-function");
  await expect(page.getByRole("tabpanel").getByRole("status")).toContainText(
    "No functions match",
  );
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("region", { name: "build function", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "clean function", exact: true }),
  ).toBeVisible();
});
