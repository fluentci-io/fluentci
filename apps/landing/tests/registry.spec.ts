import { expect, test } from "@playwright/test";
import { plugin, author } from "../src/fixtures/registry";

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
  for (const name of ["GitHub", "Discord", "Bluesky"]) {
    await expect(
      navigation.getByRole("link", { name, exact: true }),
    ).toHaveText("");
  }
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search FluentCI modules" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("link", { name: /sccache/ })).toContainText(
    "1,284 downloads",
  );
  await expect(dialog.getByRole("link", { name: /sccache/ })).toContainText(
    "@fluentci.io",
  );
  await expect(dialog.getByRole("link", { name: /sccache/ })).not.toContainText(
    "@fluentci.io/sccache",
  );
  await expect(
    dialog.getByRole("link", { name: /@alice.example\/cache/ }),
  ).not.toContainText("downloads");
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
  await expect(usage).toContainText(
    "fluentci run @fluentci.io/sccache@0.1.0 setup",
  );
  await expect(usage).toContainText("Latest version");
  await expect(
    usage.getByRole("img", { name: "227 downloads in the last 7 days" }),
  ).toBeVisible();
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
