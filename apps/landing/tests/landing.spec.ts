import { expect, test } from "@playwright/test";

const install = "curl -fsSL https://cli.fluentci.io | sh";

test("defaults to dark and remembers a white light theme", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(9, 9, 13)");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Strongly typed.Functional CI/CD.");
  expect(await heading.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))).toBeLessThan(2.1);
  const example = page.getByRole("region", { name: "PureScript pipeline example" });
  await expect(example).toContainText("src/Main.purs");
  await expect(example).toContainText("hello :: Effect Unit");
  await expect(example.locator(".hljs-string").first()).toBeVisible();
  const switcher = page.getByRole("button", { name: "Switch to light theme" });
  await switcher.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.locator("meta[name='theme-color']")).toHaveAttribute("content", "#ffffff");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("tab", { name: "TypeScript", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator(".hljs-string").first()).toHaveCSS("color", "rgb(25, 120, 69)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/landing-light-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

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
  const quickInstall = page.getByRole("region", { name: "Quick install" });
  await expect(quickInstall).toContainText(install);
  await expect(quickInstall).toBeInViewport();
  await quickInstall
    .getByRole("button", { name: "Copy install command", exact: true })
    .click();
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
  const preview = page.getByRole("img", { name: /FluentCI Studio desktop/ });
  await preview.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      preview.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
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
