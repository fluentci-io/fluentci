import { expect, test } from "@playwright/test";

const install = "curl -fsSL https://cli.fluentci.io | sh";

test("defaults to dark and remembers a white light theme", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(9, 9, 13)",
  );
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Strongly typed.Functional CI/CD.");
  expect(
    await heading.evaluate(
      (element) =>
        element.getBoundingClientRect().height /
        parseFloat(getComputedStyle(element).lineHeight),
    ),
  ).toBeLessThan(2.1);
  const example = page.getByRole("region", {
    name: "PureScript pipeline example",
  });
  await expect(example).toContainText("src/Main.purs");
  await expect(example).toContainText("import FluentCI.Plugin as CI");
  await expect(example).toContainText("import Data.Either (either)");
  await expect(example).toContainText("import Effect.Exception (throw)");
  await expect(example).toContainText("check :: Effect String");
  await expect(example).toContainText(
    'CI.exec ["bun", "install", "--frozen-lockfile"]',
  );
  await expect(example).toContainText('CI.exec ["bun", "test"]');
  await expect(example).toContainText('CI.exec ["bun", "run", "build"]');
  await expect(example).not.toContainText("--run-dir");
  await expect(example.locator("pre").first().locator("code")).toHaveText(
    /check :: Effect String/,
  );
  await expect(example.locator(".hljs-string").first()).toBeVisible();
  const switcher = page.getByRole("button", { name: "Switch to light theme" });
  await switcher.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.locator("meta[name='theme-color']")).toHaveAttribute(
    "content",
    "#ffffff",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("tab", { name: "TypeScript", exact: true }).click();
  await expect(
    page.getByRole("tabpanel").locator(".hljs-string").first(),
  ).toHaveCSS("color", "rgb(25, 120, 69)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/landing-light-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("SDK tabs show highlighted samples, matching scaffold commands, and support the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("tab").first()).toHaveText("ClojureScript");
  await expect(
    page.getByRole("tab", { name: "ClojureScript", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  for (const [name, sdk, source] of [
    ["ClojureScript", "clojurescript", "src/main/plugin.cljc"],
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
    await expect(panel).toContainText("fluentci run ci check");
    await expect(panel).toContainText("requirements-ci.txt");
    await expect(panel).toContainText("--no-isolation");
    await expect(panel).toContainText("pytest");
    await expect(panel).toContainText("ruff");
    await expect(panel).toContainText("$(mktemp -d)/run");
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
    page.getByRole("tab", { name: "ClojureScript", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "ReScript", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "ClojureScript", exact: true }),
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

test("CI/CD evolution connects sourced milestones to programmable delivery in both themes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const section = page.getByRole("region", {
    name: "From YAML files to programmable delivery.",
  });
  await expect(section).toBeVisible();
  const timeline = section.getByRole("list", { name: "CI/CD evolution" });
  await expect(timeline.getByRole("listitem")).toHaveCount(5);
  for (const era of ["2010–2015", "2016", "2019", "2020s", "Now"]) {
    await expect(timeline.getByText(era, { exact: true })).toBeVisible();
  }
  await expect(
    section.getByRole("heading", { name: "The agent era" }),
  ).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Jenkins 2.0" }),
  ).toHaveAttribute(
    "href",
    "https://www.jenkins.io/blog/2016/04/26/jenkins-20-is-here/",
  );
  await expect(
    section.getByRole("link", { name: "GitHub Actions" }),
  ).toHaveAttribute("target", "_blank");
  await expect(
    section.getByRole("link", { name: "Build a programmable pipeline" }),
  ).toHaveAttribute("href", "#sdks");
  await section.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/evolution-dark-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveCSS("color", "rgb(24, 24, 34)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/evolution-light-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
