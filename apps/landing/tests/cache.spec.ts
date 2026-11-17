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
        method === "createToken"
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
  await expect.poll(() => calls.at(-1)?.body.owner).toBe("friend.example");
  await page.getByLabel("Collaborator handle or DID").fill("@teammate.example");
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Upload access|CI credential revoked/ }),
  ).toContainText("Upload access granted");
  expect(calls.at(-1)).toEqual({
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
