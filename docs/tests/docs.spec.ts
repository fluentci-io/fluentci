import { expect, test } from "@playwright/test";

test("navigation, highlighted examples, themes and code copy work at every width", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Introduction",
  );
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(9, 9, 13)",
  );
  if (info.project.name !== "desktop") {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Menu", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
  }
  await page
    .locator("#sidebar")
    .getByRole("link", { name: "ClojureScript", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sdks\/clojurescript\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ClojureScript",
  );
  await expect(
    page.locator(".language-clojurescript .hljs-string").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const firstCode = page.locator("pre").first();
  await firstCode.getByRole("button", { name: "Copy code" }).click();
  await expect(firstCode.getByRole("button")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "fluentci init --sdk clojurescript",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `test-results/docs-${info.project.name}.png` });
});

test("Pagefind searches real content and keyboard shortcuts open the dialog", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {
    name: "Search documentation",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.locator("pagefind-input input").fill("app password");
  const result = dialog
    .locator("pagefind-results")
    .getByRole("link", { name: /Account and Tangled/ })
    .first();
  await expect(result).toBeVisible({ timeout: 15000 });
  await result.click();
  await expect(page).toHaveURL(/\/registry\/authentication\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Account and Tangled",
  );
  expect(errors).toEqual([]);
});

test("repository-only notes are unavailable and llms.txt is readable", async ({
  request,
}) => {
  expect((await request.get("/rust-port.md")).status()).toBe(404);
  expect((await request.get("/rust-port/")).status()).toBe(404);
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain("# FluentCI documentation");
  expect(await llms.text()).toContain("ClojureScript");
  expect(await llms.text()).not.toContain("rust-port");
});
