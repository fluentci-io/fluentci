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

test("validates forms, suggests project paths, and inspects pipeline spans", async ({
  page,
}, testInfo) => {
  await page.goto("/project/local-fluentci/actions");
  const module = page.getByRole("combobox", { name: "Action 1 module" });
  await module.fill("rus");
  await page.getByRole("option", { name: "rust", exact: true }).click();
  const commands = page.getByRole("combobox", {
    name: "Action 1 functions / commands",
  });
  await commands.fill("bu");
  await page.getByRole("option", { name: "build", exact: true }).click();
  const directory = page.getByRole("combobox", {
    name: "Action 1 working directory",
  });
  await directory.fill("webui/s");
  await page.getByRole("option", { name: "webui/src", exact: true }).click();
  await expect(directory).toHaveValue("webui/src");
  const name = page.getByRole("textbox", { name: "Action 1 name" });
  await name.fill("   ");
  await page.getByRole("button", { name: "Save actions" }).click();
  await expect(page.getByText("Enter a step name.")).toBeVisible();
  await name.fill("Build frontend");
  await page.getByRole("button", { name: "Save actions" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("renamed-project");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await page.getByRole("link", { name: "Execution", exact: true }).click();
  await page.getByRole("button", { name: "Spans", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Pipeline spans" }),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    const bounds = await page.getByTestId("span-timeline").boundingBox();
    await page.mouse.move(
      bounds!.x + 172 + (bounds!.width - 252) * 0.6,
      bounds!.y + 40,
    );
    await expect(page.getByTestId("span-hover-guide")).toBeVisible();
  }
  await page.screenshot({
    path: `test-results/spans-${testInfo.project.name}.png`,
    fullPage: testInfo.project.name !== "desktop",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Inspect Build Studio span" }).click();
  await expect(
    page.getByRole("button", { name: /Build Studio/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("✓ 148 modules transformed")).toBeVisible();
});

test("live logs follow the tail, pause on upward scrolling, and resume", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci?fixture=large");
  const output = page.getByLabel("Test engine output");
  const distanceFromEnd = () =>
    output.evaluate(
      (element) =>
        element.scrollHeight - element.clientHeight - element.scrollTop,
    );
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await expect.poll(distanceFromEnd).toBeLessThan(4);
  await output.evaluate((element) => {
    element.scrollTop -= 400;
  });
  await expect(
    page.getByRole("button", { name: "Paused", exact: true }),
  ).toBeVisible();
  await expect.poll(distanceFromEnd).toBeGreaterThan(100);
  const top = await output.evaluate((element) => element.scrollTop);
  const summary = page.getByText(/steps finished.*log lines/);
  const previous = await summary.textContent();
  await expect(summary).not.toHaveText(previous!);
  expect(
    Math.abs((await output.evaluate((element) => element.scrollTop)) - top),
  ).toBeLessThan(4);
  await page.getByRole("button", { name: "Paused", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await expect.poll(distanceFromEnd).toBeLessThan(4);
});
