import { expect, test } from "@playwright/test";

const install =
  "curl -fsSL https://cli.fluentci.io | sh";

test("SDK tabs show highlighted samples, matching scaffold commands, and support the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  for (const [name, sdk, source] of [
    ["PureScript", "purescript", "src/Main.purs"],
    ["Python", "python", "plugin.py"],
    ["TypeScript", "typescript", "entry.ts"],
    ["Gleam", "gleam", "src/plugin.gleam"],
    ["Elixir", "elixir", "lib/main.ex"],
    ["ReScript", "rescript", "src/Greeting.res"],
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText(source);
    await expect(panel).toContainText(`--sdk ${sdk}`);
    await expect(panel.locator(".sdk-code .hljs-string").first()).toBeVisible();
    await expect(panel).toContainText("fluentci run ci hello");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("tab", { name: "ReScript", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "PureScript", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "ReScript", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "PureScript", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("copies the installer, renders the preview, and links to the project and community", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Copy command", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copied" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    install,
  );
  await expect(
    page.getByRole("link", { name: "GitHub", exact: true }).first(),
  ).toHaveAttribute("href", "https://github.com/fluentci-io/fluentci");
  await expect(
    page.getByRole("link", { name: "Discord", exact: true }).first(),
  ).toHaveAttribute("href", "https://discord.gg/H7M28d9dRk");
  await expect(
    page.getByText("Made with ♥ in Antananarivo, Madagascar"),
  ).toBeVisible();
  expect(
    await page
      .getByRole("img", { name: /FluentCI Studio desktop/ })
      .evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("body")).toHaveCSS("font-family", /Lexend/);
  expect(
    await page.evaluate(() =>
      Array.from(document.fonts).some(
        (font) => font.family.includes("Lexend") && font.status === "loaded",
      ),
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-family",
    /Lexend/,
  );
  await expect(page.locator(".code").first()).toHaveCSS(
    "font-family",
    /Inconsolata/,
  );
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  const { nodeId } = await session.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "h1",
  });
  const { fonts } = await session.send("CSS.getPlatformFontsForNode", {
    nodeId,
  });
  expect(
    fonts.some(
      (font) =>
        font.isCustomFont &&
        /Lexend/i.test(font.familyName) &&
        font.glyphCount > 0,
    ),
  ).toBe(true);
  await session.detach();
  await page.screenshot({
    path: `test-results/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
