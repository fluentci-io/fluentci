import { expect as baseExpect, test, type Page } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { author, plugin } from "../src/fixtures/registry";
const expect = baseExpect.configure({ timeout: 20_000 });
const did = "did:plc:zyxwvutsrqponmlkjihgfedc";
const key = generateKeyPairSync("ec", {
  namedCurve: "P-256",
}).privateKey.export({ format: "jwk" });
const rkey = "3mmmmmmmmmmma";
async function common(page: Page, likesCount = 3) {
  await page.route(
    "https://api.fluentci.io/xrpc/io.fluentci.registry.*",
    (route) =>
      route.fulfill({
        json: {
          packages: [{ ...plugin, likesCount }],
          package: { ...plugin, likesCount },
          total: 1,
        },
      }),
  );
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?*",
    (route) =>
      route.fulfill({
        json: {
          profiles: [
            author,
            {
              did,
              handle: "person.example",
              displayName: "A Person",
              avatar: "https://images.example/avatar.png",
            },
          ],
        },
      }),
  );
  await page.route("https://images.example/avatar.png", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route("https://modules.example/README.md", (route) =>
    route.fulfill({ body: "# Module", contentType: "text/markdown" }),
  );
}
async function signedIn(page: Page) {
  await page.addInitScript(
    ({ did, key }) => {
      if (sessionStorage.getItem("test-seeded")) return;
      sessionStorage.setItem("test-seeded", "true");
      sessionStorage.setItem("fluentci-account", did);
      sessionStorage.setItem("fluentci-oauth:version", "2");
      sessionStorage.setItem(
        `fluentci-oauth:sessions:${did}`,
        JSON.stringify({
          value: {
            dpopKey: { ...key, alg: "ES256" },
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
              scope: "atproto repo:io.fluentci.like repo:io.fluentci.plugin",
              type: "DPoP",
              access: "test-access",
              refresh: "test-refresh",
              expires_at: Date.now() + 3600000,
            },
          },
          expiresAt: Date.now() + 3600000,
          revision: 1,
        }),
      );
    },
    { did, key },
  );
}

test("sign in opens a handle modal, supports Escape, and advertises collection-scoped OAuth", async ({
  page,
}) => {
  await common(page, 0);
  await page.goto("/modules");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Sign in to FluentCI" });
  await expect(modal.getByRole("combobox", { name: "Handle" })).toBeFocused();
  const box = await modal.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(
    2,
  );
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(
    2,
  );
  await expect(
    modal.getByRole("link", { name: /What is an Atmosphere account/ }),
  ).toHaveAttribute("href", "https://atmosphereaccount.com");
  await expect(
    modal.getByRole("link", { name: /Create an account/ }),
  ).toHaveAttribute("href", "https://selfhosted.social/signup");
  await modal.getByRole("combobox").fill("not-a-handle");
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "complete AT Protocol handle",
  );
  await page.keyboard.press("Escape");
  if (await modal.isVisible()) await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Like sccache", exact: true }),
  ).toHaveText("");
  await page.getByRole("button", { name: "Like sccache", exact: true }).click();
  await expect(modal).toBeVisible();
  const metadata = await (
    await page.request.get("/oauth-client-metadata.json")
  ).json();
  expect(metadata.client_id).toBe(
    "https://fluentci.io/oauth-client-metadata.json",
  );
  expect(metadata.redirect_uris).toEqual([
    "https://fluentci.io/oauth/callback",
  ]);
  expect(metadata.scope).toBe(
    "atproto repo:io.fluentci.like repo:io.fluentci.plugin",
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /oauth|account/.test(key)),
    ),
  ).toEqual([]);
});

test("likes write directly to the PDS, toggle idempotently, and roll back errors", async ({
  page,
}) => {
  await common(page);
  await signedIn(page);
  const writes: string[] = [];
  let fail = false;
  let records: {
    uri: string;
    cid: string;
    value: { subject: { uri: string; cid: string } };
  }[] = [];
  await page.route("https://pds.example/xrpc/*", async (route) => {
    const method = new URL(route.request().url()).pathname.split("/").pop()!;
    if (method === "com.atproto.repo.listRecords")
      return route.fulfill({ json: { records } });
    expect(route.request().headers().authorization).toBe("DPoP test-access");
    expect(route.request().headers().dpop).toBeTruthy();
    const body = route.request().postDataJSON();
    expect(body.repo).toBe(did);
    expect(body.collection).toBe("io.fluentci.like");
    if (method === "com.atproto.repo.createRecord")
      expect(body).not.toHaveProperty("rkey");
    else expect(body.rkey).toBe(rkey);
    if (body.record)
      expect(body.record.subject).toEqual({ uri: plugin.uri, cid: plugin.cid });
    writes.push(method);
    if (!fail)
      records = body.record
        ? [
            {
              uri: `at://${did}/io.fluentci.like/${rkey}`,
              cid: plugin.cid,
              value: body.record,
            },
          ]
        : [];
    return fail
      ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
      : route.fulfill({
          json: {
            uri: `at://${did}/io.fluentci.like/${rkey}`,
            cid: "bafyreia",
          },
        });
  });
  await page.goto("/modules");
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
  const like = page.getByRole("button", { name: "Like sccache", exact: true });
  await expect(like).toBeEnabled();
  await expect(like).toContainText("3");
  await like.click();
  const unlike = page.getByRole("button", {
    name: "Unlike sccache",
    exact: true,
  });
  await expect(unlike).toContainText("4");
  await expect(unlike).toBeEnabled();
  await unlike.click();
  await expect(like).toContainText("3");
  await expect(like).toBeEnabled();
  expect(writes).toEqual([
    "com.atproto.repo.createRecord",
    "com.atproto.repo.deleteRecord",
  ]);
  fail = true;
  await like.click();
  await expect(page.getByRole("alert")).toContainText("Unable to save like");
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(like).toContainText("3");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /oauth|account/.test(key)),
    ),
  ).toEqual([]);
});

test("avatar menu links to profile and logs out of the browser session", async ({
  page,
  context,
}) => {
  await common(page);
  await signedIn(page);
  await page.route("https://pds.example/oauth/revoke", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await page.route("https://pds.example/xrpc/*", (route) =>
    route.fulfill({ json: { records: [] } }),
  );
  await page.goto("/modules");
  await page.getByRole("button", { name: "Account menu" }).click();
  const menu = page.getByLabel("Account", { exact: true });
  await expect(menu).toContainText("A Person");
  await expect(menu).toContainText("@person.example");
  await expect(menu.getByRole("link")).toHaveAttribute(
    "href",
    "/person.example",
  );
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  const other = await context.newPage();
  await common(other);
  await other.goto("/modules");
  await expect(
    other.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeEnabled();
  await other.close();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) =>
          key.startsWith("fluentci-oauth:sessions:"),
        ),
      ),
    )
    .toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeEnabled();
});

test("sign-in suggests handles and supports keyboard selection while leaving manual entry available", async ({
  page,
}) => {
  await common(page);
  await page.route(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?*",
    (route) =>
      route.fulfill({
        json: { actors: [{ ...author, displayName: "FluentCI" }] },
      }),
  );
  await page.goto("/modules");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const input = page.getByRole("combobox", { name: "Handle" });
  await input.fill("fluent");
  const list = page.getByRole("listbox", { name: "Suggested accounts" });
  await expect(list.getByRole("option")).toContainText("@fluentci.io");
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    "handle-option-0",
  );
  await input.press("Enter");
  await expect(input).toHaveValue("fluentci.io");
  await expect(list).toHaveCount(0);
  await input.fill("person.selfhosted.social");
  await expect(input).toHaveValue("person.selfhosted.social");
});

test("handle sign-in discovers the PDS and starts PKCE OAuth with both collection permissions", async ({
  page,
}) => {
  await common(page);
  await page.route(
    "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?*",
    (route) => route.fulfill({ json: { did } }),
  );
  await page.route(
    `https://plc.directory/${encodeURIComponent(did)}`,
    (route) =>
      route.fulfill({
        json: {
          id: did,
          alsoKnownAs: ["at://person.example"],
          service: [
            {
              id: `${did}#atproto_pds`,
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: "https://pds.example",
            },
          ],
        },
      }),
  );
  await page.route(
    "https://pds.example/.well-known/oauth-protected-resource",
    (route) =>
      route.fulfill({
        json: {
          resource: "https://pds.example",
          authorization_servers: ["https://pds.example"],
        },
      }),
  );
  await page.route(
    "https://pds.example/.well-known/oauth-authorization-server",
    (route) =>
      route.fulfill({
        json: {
          issuer: "https://pds.example",
          authorization_endpoint: "https://pds.example/oauth/authorize",
          token_endpoint: "https://pds.example/oauth/token",
          pushed_authorization_request_endpoint:
            "https://pds.example/oauth/par",
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          scopes_supported: [
            "atproto",
            "repo:io.fluentci.like",
            "repo:io.fluentci.plugin",
          ],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          dpop_signing_alg_values_supported: ["ES256"],
          authorization_response_iss_parameter_supported: true,
          client_id_metadata_document_supported: true,
        },
      }),
  );
  let par: URLSearchParams | undefined;
  await page.route("https://pds.example/oauth/par", (route) => {
    par = new URLSearchParams(route.request().postData()!);
    expect(route.request().headers().dpop).toBeTruthy();
    return route.fulfill({
      status: 201,
      json: {
        request_uri: "urn:ietf:params:oauth:request_uri:test",
        expires_in: 60,
      },
    });
  });
  await page.route("https://pds.example/oauth/authorize?*", (route) =>
    route.fulfill({ body: "Authorization server", contentType: "text/html" }),
  );
  await page.goto("/modules");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.getByRole("combobox", { name: "Handle" }).fill("person.example");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  try {
    await expect(page).toHaveURL(/^https:\/\/pds.example\/oauth\/authorize\?/);
  } catch {
    const details = await page.evaluate(async () => {
      const path = "/src/auth/client.ts";
      try {
        const auth = await import(path);
        await auth.signIn("person.example");
        return "Authorization started";
      } catch (error) {
        return JSON.stringify(
          error,
          Object.getOwnPropertyNames(Error.prototype).concat([
            "message",
            "cause",
            "issues",
            "expected",
            "received",
            "name",
          ]),
        );
      }
    });
    throw Error(String(details));
  }
  expect(par!.get("scope")).toBe(
    "atproto repo:io.fluentci.like repo:io.fluentci.plugin",
  );
  expect(par!.get("code_challenge_method")).toBe("S256");
  expect(par!.get("code_challenge")).toBeTruthy();
  expect(par!.get("state")).toBeTruthy();
});
