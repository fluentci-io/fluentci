import { expect, test } from "@playwright/test";

test("runs, streams, searches, downloads, cancels, and restarts", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci");
  await expect(
    page.getByRole("button", { name: "Cancel pipeline" }),
  ).toBeEnabled();
  const step = page.getByRole("button", { name: /Test engine/ });
  await expect(step).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/test pipeline::integration::case_/).first(),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search logs" }).fill("bun");
  await expect(page.locator("mark").first()).toHaveText("bun");
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download logs" }).click();
  const file = await pendingDownload;
  expect(file.suggestedFilename()).toMatch(/^fluentci-.*\.txt$/);
  await page.getByRole("button", { name: "Clear log search" }).click();
  await page.getByRole("button", { name: "Cancel pipeline" }).click();
  await expect(
    page.getByRole("button", { name: "Restart pipeline" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Restart pipeline" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel pipeline" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/execution-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("history tooltips and keyboard command palette", async ({ page }) => {
  await page.goto("/project/local-fluentci");
  await expect(
    page.getByRole("button", { name: "Cancel pipeline" }),
  ).toBeEnabled();
  const history = page.getByRole("link", { name: /Passed ·/ }).first();
  await history.focus();
  await expect(history.locator("..").getByRole("tooltip")).toBeVisible();
  await history.click();
  await expect(page).toHaveURL(/\/run\//);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Quick search" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("edit pipeline");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Pipeline actions" }),
  ).toBeVisible();
  await expect(palette).not.toBeVisible();
});

test("saved-log search jumps to the matching step", async ({ page }) => {
  await page.goto("/project/local-fluentci");
  await expect(
    page.getByRole("button", { name: "Cancel pipeline" }),
  ).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Quick search" });
  await palette.getByRole("combobox").fill("transformed");
  await palette.getByRole("option").first().click();
  await expect(
    page.getByRole("button", { name: /Build Studio/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("✓ 148 modules transformed")).toBeVisible();
  await page.screenshot({
    path: `test-results/logs-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("large logs stay virtualized while search covers every line", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci?fixture=large");
  await expect(
    page.getByRole("button", { name: "Cancel pipeline" }),
  ).toBeEnabled();
  const output = page.getByLabel("Test engine output");
  await expect(page.getByText(/10,0\d+ log lines/)).toBeVisible();
  expect(await output.locator("pre").count()).toBeLessThan(100);
  await page
    .getByRole("textbox", { name: "Search logs" })
    .fill("large-output-line-09999");
  await expect(page.locator("mark")).toHaveText("large-output-line-09999");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("left panel toggles while preserving project bars and stats", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", {
    name: "Workspace navigation",
  });
  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "Hide left panel" }).click();
    await expect(sidebar).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Show left panel" }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Show left panel" }).click();
  await expect(sidebar).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hide left panel" }),
  ).toHaveAttribute("aria-expanded", "true");
  if (testInfo.project.name === "mobile") {
    await page.keyboard.press("Escape");
    await expect(sidebar).not.toBeVisible();
    await page.getByRole("button", { name: "Show left panel" }).click();
    await sidebar.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(sidebar).not.toBeVisible();
  } else {
    await page.getByRole("button", { name: "Hide left panel" }).click();
  }
  await expect(
    page.getByText("Active projects", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your projects" }),
  ).toBeVisible();
  await expect(page.getByLabel("Build history").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/overview-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
