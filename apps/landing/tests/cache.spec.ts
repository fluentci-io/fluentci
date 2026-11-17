import { expect, test, type Page } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { scope } from "../src/auth/permissions";
const did = "did:plc:zyxwvutsrqponmlkjihgfedc";
const privateKey = generateKeyPairSync("ec", {
  namedCurve: "P-256",
}).privateKey.export({ format: "jwk" });
const token = "account-upload-token";
const secret = "fc_cache_ci_credential-once";

async function session(page: Page, legacy = false) {
  await page.addInitScript(
    ({ did, privateKey, granted }) => {
      if (sessionStorage.getItem("cache-test-seeded")) return;
      sessionStorage.setItem("cache-test-seeded", "true");
      document.cookie = "fluentci-browser-session=1; Path=/; SameSite=Lax";
      localStorage.setItem("fluentci-account", did);
      localStorage.setItem("fluentci-oauth:version", "2");
      localStorage.setItem(
        `fluentci-oauth:sessions:${did}`,
        JSON.stringify({
          value: {
            dpopKey: { ...privateKey, alg: "ES256" },
            info: {
              sub: did,
              aud: "https://pds.example",
              server: {
                issuer: "https://pds.example",
                token_endpoint: "https://pds.example/oauth/token",
                revocation_endpoint: "https://pds.example/oauth/revoke",
              },
            },
            token: {
              scope: granted,
              type: "DPoP",
              access: "pds-access-token",
              refresh: "pds-refresh-token",
              expires_at: Date.now() + 3600000,
            },
          },
          expiresAt: Date.now() + 3600000,
          revision: 1,
        }),
      );
    },
    {
      did,
      privateKey,
      granted: legacy
        ? "atproto repo:io.fluentci.like repo:io.fluentci.plugin"
        : scope,
    },
  );
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
    (route) =>
      route.fulfill({ json: { profiles: [{ did, handle: "owner.example" }] } }),
  );
}

async function mock(page: Page) {
  const methods: string[] = [];
  const calls: { method: string; body: Record<string, string> }[] = [];
  let revoked = false;
  await page.route(
    "https://pds.example/xrpc/com.atproto.server.getServiceAuth?*",
    async (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get("aud")).toBe("did:web:api.fluentci.io");
      const method = params.get("lxm")!.split(".").pop()!;
      methods.push(method);
      await route.fulfill({ json: { token: `service-${method}` } });
    },
  );
  await page.route("https://pds.example/oauth/revoke", (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.*",
    async (route) => {
      const request = route.request();
      const method = request.url().split(".").pop()!;
      expect(request.headers().authorization).toBe(`Bearer service-${method}`);
      calls.push({ method, body: request.postDataJSON() });
      const credential = {
        id: "a6936fbe-71f6-4acf-898f-c7b6fccf836c",
        label: "Build",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(),
        active: !revoked,
      };
      const body =
        method === "getUsageHistory"
          ? { samples: [] }
          : method === "listKeys"
            ? { keys: [], totalKeys: 0, totalBytes: 0 }
            : method === "listCollaborators"
              ? { actors: [] }
              : method === "createToken"
                ? {
                    token,
                    cacheUrl: "https://cache.example/accounts/account",
                    expiresAt: new Date(Date.now() + 3600000).toISOString(),
                    owner: did,
                  }
                : method === "createCredential"
                  ? { ...credential, credential: secret, owner: did }
                  : method === "listCredentials"
                    ? { credentials: [credential] }
                    : method === "revokeCredential"
                      ? ((revoked = true), { revoked: true })
                      : {
                          owner: did,
                          actor: "did:plc:invited",
                          active: method === "inviteUser",
                        };
      await route.fulfill({ json: body });
    },
  );
  return { methods, calls };
}

async function selectPanel(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Cache navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("cache requires sign in and older sessions need cache authorization", async ({
  page,
}) => {
  await page.goto("/cache");
  await expect(
    page.getByRole("button", { name: "Sign in to manage cache" }),
  ).toBeVisible();
  await session(page, true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Authorize cache access", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate upload token" }),
  ).toHaveCount(0);
});

test("cache exchanges method-scoped service tokens, invites users, renews and clears secrets on sign out", async ({
  page,
}) => {
  await session(page);
  const { methods, calls } = await mock(page);
  await page.goto("/cache");
  await selectPanel(page, "Upload tokens");
  await page.getByRole("button", { name: "Generate upload token" }).click();
  await expect(page.getByLabel("Upload token", { exact: true })).toHaveValue(
    token,
  );
  await expect(
    page.getByLabel("Upload token", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Renew upload token" }).click();
  await expect
    .poll(() => calls.filter((call) => call.method === "createToken").length)
    .toBe(2);
  await page.getByLabel("Cache owner (optional)").fill("@friend.example");
  await expect(page.getByLabel("Upload token", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Generate upload token" }).click();
  await expect
    .poll(
      () => calls.findLast((call) => call.method === "createToken")?.body.owner,
    )
    .toBe("friend.example");
  await selectPanel(page, "Collaborators");
  await page.getByLabel("Collaborator handle or DID").fill("@teammate.example");
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Upload access|CI credential revoked/ }),
  ).toContainText("Upload access granted");
  expect(calls.findLast((call) => call.method === "inviteUser")).toEqual({
    method: "inviteUser",
    body: { actor: "teammate.example" },
  });
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Upload access|CI credential revoked/ }),
  ).toContainText("Upload access revoked");
  expect(methods).toContain("revokeUser");
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(storage).not.toContain(token);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByLabel("Upload token", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign in to manage cache" }),
  ).toBeVisible();
});

test("CI credential secret appears once and owner can revoke it", async ({
  page,
}) => {
  await session(page);
  const { calls } = await mock(page);
  await page.goto("/cache");
  await selectPanel(page, "CI credentials");
  await page.getByLabel("Credential name").fill("Build");
  await page
    .getByRole("button", { name: "Create CI credential", exact: true })
    .click();
  await expect(page.getByLabel("CI credential", { exact: true })).toHaveValue(
    secret,
  );
  await expect(
    page.getByText("Copy this credential now.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss secret" }).click();
  await expect(page.getByLabel("CI credential", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Refresh credentials" }).click();
  await expect(
    page.getByRole("button", { name: "Revoke Build" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke Build" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Upload access|CI credential revoked/ }),
  ).toContainText("CI credential revoked");
  await expect(page.getByRole("button", { name: "Revoke Build" })).toHaveCount(
    0,
  );
  expect(calls.some((call) => call.method === "revokeCredential")).toBe(true);
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(storage).not.toContain(secret);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/fluentci-cache-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("cache invitations suggest handles and listed collaborators can be removed", async ({
  page,
}) => {
  await session(page);
  await mock(page);
  const collaborator = "did:plc:abcdefghijklmnopqrstuvwx";
  let invited = false;
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?*",
    (route) =>
      route.fulfill({
        json: {
          actors: [
            {
              did: collaborator,
              handle: "teammate.example",
              displayName: "Teammate",
            },
          ],
        },
      }),
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.inviteUser",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        actor: "teammate.example",
      });
      invited = true;
      await route.fulfill({
        json: { owner: did, actor: collaborator, active: true },
      });
    },
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.listCollaborators",
    (route) =>
      route.fulfill({ json: { actors: invited ? [collaborator] : [] } }),
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.revokeUser",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({ actor: collaborator });
      invited = false;
      await route.fulfill({
        json: { owner: did, actor: collaborator, active: false },
      });
    },
  );
  await page.goto("/cache");
  await selectPanel(page, "Collaborators");
  const input = page.getByLabel("Collaborator handle or DID");
  await input.fill("team");
  await expect(
    page.getByRole("option", { name: /teammate.example/ }),
  ).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("teammate.example");
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  await page
    .getByRole("button", { name: `Remove ${collaborator}`, exact: true })
    .click();
  await expect(page.getByText("No invited collaborators.")).toBeVisible();
});

test("cache storage shows usage, deletes selected keys, and requires CLEAR confirmation", async ({
  page,
}) => {
  await session(page);
  await mock(page);
  let keys = [
    { key: "generic/a", size: 2048, lastModified: new Date().toISOString() },
  ];
  let cleared = false;
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.listKeys",
    (route) =>
      route.fulfill({
        json: {
          keys,
          totalKeys: keys.length,
          totalBytes: keys.reduce((sum, key) => sum + key.size, 0),
        },
      }),
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.deleteKey",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({ key: "generic/a" });
      keys = [];
      await route.fulfill({ json: { deleted: 1 } });
    },
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.clearCache",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({ confirm: true });
      cleared = true;
      keys = [];
      await route.fulfill({ json: { deleted: 0 } });
    },
  );
  await page.goto("/cache");
  await page
    .getByRole("button", { name: "Refresh entries", exact: true })
    .click();
  await expect(page.getByLabel("Cache usage", { exact: true })).toHaveText(
    "2.0 KiB used · 1 keys",
  );
  await page
    .getByRole("button", { name: "Delete generic/a", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("generic/a", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Delete generic/a", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page.getByLabel("Cache usage", { exact: true })).toHaveText(
    "0 B used · 0 keys",
  );
  await page.getByRole("button", { name: "Clear cache", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm deletion", exact: true }),
  ).toBeDisabled();
  expect(cleared).toBe(false);
  await page.getByLabel("Type CLEAR to confirm").fill("CLEAR");
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect.poll(() => cleared).toBe(true);
});

test("upload token instructions cover every client without exposing the token in snippets", async ({
  page,
}) => {
  await session(page);
  await mock(page);
  await page.goto("/cache");
  await selectPanel(page, "Upload tokens");
  await page
    .getByRole("button", { name: "Generate upload token", exact: true })
    .click();
  const instructions = page.getByRole("region", {
    name: "Token setup instructions",
    exact: true,
  });
  await expect(instructions).toContainText(
    "https://cache.example/accounts/account",
  );
  await expect(instructions).not.toContainText(token);
  const client = page.getByLabel("Cache client", { exact: true });
  for (const [id, expected] of [
    ["bazel", "--remote_header"],
    ["sccache", "SCCACHE_WEBDAV_TOKEN"],
    ["go", "GOCACHEPROG"],
    ["gradle", "remote<HttpBuildCache>"],
    ["maven", "${env.FLUENTCI_CACHE_TOKEN}"],
    ["nix", "nix copy --to"],
    ["http", "--upload-file"],
  ]) {
    await client.selectOption(id);
    await expect(instructions).toContainText(expected);
    await expect(
      instructions.locator("code .hljs-string").first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("cache dashboard tables filter immediately and sidebar switches views", async ({
  page,
}) => {
  await session(page);
  await mock(page);
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.listKeys",
    (route) =>
      route.fulfill({
        json: {
          keys: [
            {
              key: "generic/release",
              size: 2048,
              lastModified: new Date().toISOString(),
            },
            {
              key: "bazel/cas/build",
              size: 4096,
              lastModified: new Date().toISOString(),
            },
          ],
          totalKeys: 2,
          totalBytes: 6144,
        },
      }),
  );
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.listCollaborators",
    (route) =>
      route.fulfill({
        json: {
          actors: [
            "did:plc:friendoneabcdefghijklmn",
            "did:plc:friendtwoabcdefghijklmn",
          ],
        },
      }),
  );
  await page.goto("/cache");
  const table = page.getByRole("table", { name: "Cache entries", exact: true });
  await expect(table.getByRole("row")).toHaveCount(3);
  await page
    .getByLabel("Search cache entries", { exact: true })
    .fill("release");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).not.toContainText("bazel/cas/build");
  await selectPanel(page, "Collaborators");
  const collaborators = page.getByRole("table", {
    name: "Collaborators",
    exact: true,
  });
  await expect(collaborators.getByRole("row")).toHaveCount(3);
  await page
    .getByLabel("Search collaborators", { exact: true })
    .fill("friendtwo");
  await expect(collaborators.getByRole("row")).toHaveCount(2);
  await expect(collaborators).not.toContainText("friendone");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/fluentci-cache-dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("usage graph shows 14 real UTC days and distinguishes missing history from zero", async ({
  page,
}) => {
  await session(page);
  await mock(page);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.cache.getUsageHistory",
    (route) =>
      route.fulfill({
        json: {
          samples: [
            {
              date: yesterday,
              bytes: 0,
              keyCount: 0,
              observedAt: `${yesterday}T12:00:00.000Z`,
            },
            {
              date: today,
              bytes: 2048,
              keyCount: 2,
              observedAt: new Date().toISOString(),
            },
          ],
        },
      }),
  );
  await page.goto("/cache");
  const chart = page.getByRole("region", {
    name: "Cache usage last 14 days",
    exact: true,
  });
  await expect(chart.getByRole("button")).toHaveCount(14);
  await expect(
    chart.getByRole("button", { name: `${today}: 2.0 KiB`, exact: true }),
  ).toBeVisible();
  await expect(
    chart.getByRole("button", { name: `${yesterday}: 0 B`, exact: true }),
  ).toBeVisible();
  await expect(chart.getByRole("button", { name: /No data/ })).toHaveCount(12);
  await chart
    .getByLabel("Usage chart metric", { exact: true })
    .selectOption("keyCount");
  await expect(
    chart.getByRole("button", { name: `${today}: 2 keys`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/fluentci-cache-usage-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("collaborator invitation rejects the current account in suggestions and manual input", async ({
  page,
}) => {
  await session(page);
  await mock(page);
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?*",
    (route) =>
      route.fulfill({
        json: {
          actors: [{ did, handle: "self.example", displayName: "Yourself" }],
        },
      }),
  );
  await page.goto("/cache");
  await selectPanel(page, "Collaborators");
  const input = page.getByLabel("Collaborator handle or DID");
  await input.fill(did);
  await expect(
    page.getByRole("button", { name: "Invite user", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("You already own this cache and cannot invite yourself."),
  ).toBeVisible();
  await input.fill("self");
  await expect(page.getByRole("option", { name: /self.example/ })).toHaveCount(
    0,
  );
});
