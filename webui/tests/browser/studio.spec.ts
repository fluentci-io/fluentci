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
    page.getByRole("heading", { name: "Default actions" }),
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

test("re-runs a single job from its hover control", async ({
  page,
}, testInfo) => {
  await page.goto("/project/local-fluentci");
  const job = page.getByRole("button", { name: /Build Studio/ });
  await expect(job).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Following", exact: true }).click();
  await job.hover();
  const restart = page
    .getByRole("button", { name: "Re-run job", exact: true })
    .first();
  await expect(restart).toHaveAttribute("title", "Re-run job");
  await expect(restart).toHaveCSS("opacity", "1");
  await restart.click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(
    page.getByRole("button", { name: /Build Studio/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Test engine/ })).toContainText(
    "Skipped",
  );
  await expect(
    page.getByRole("button", { name: "Re-run job", exact: true }).first(),
  ).toBeDisabled();
  await page.screenshot({
    path: `test-results/rerun-job-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("selects workflows from quick search with their parent project", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci/actions");
  await page.getByRole("button", { name: "Manage workflow" }).click();
  await page.getByRole("button", { name: "Duplicate workflow" }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicate workflow" });
  await dialog.getByLabel("Workflow ID").fill("release");
  await dialog.getByLabel("Name", { exact: true }).fill("Publish packages");
  await dialog.getByRole("button", { name: "Duplicate workflow" }).click();
  await expect(
    page.getByRole("combobox", { name: "Workflow", exact: true }),
  ).toHaveValue("release");
  await page.getByRole("link", { name: "Execution", exact: true }).click();
  await expect(page.getByRole("region", { name: "Run history" })).toContainText(
    "0 runs",
  );
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Quick search" });
  await palette.getByRole("combobox").fill("Publish packages");
  const result = palette.getByRole("option", {
    name: /Publish packages.*fluentci/i,
  });
  await expect(result).toBeVisible();
  await page.screenshot({
    path: `test-results/workflow-search-${test.info().project.name}.png`,
  });
  await result.click();
  await expect(page).toHaveURL(/workflow=release/);
  await page.getByRole("link", { name: "Actions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Publish packages actions" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/workflow-actions-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("composes CI events visually and keeps repository autocomplete custom", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci/actions");
  const triggers = page.getByRole("region", {
    name: "Workflow event triggers",
  });
  await triggers
    .getByRole("checkbox", { name: "On pull request", exact: true })
    .check();
  await triggers.getByLabel("Target branches", { exact: true }).fill("main");
  await triggers.getByLabel("UTC cron expressions").fill("0 6 * * 1-5");
  await triggers.getByRole("button", { name: "Save triggers" }).click();
  await expect(
    triggers.getByRole("button", { name: "Saved triggers" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/workflow-triggers-${test.info().project.name}.png`,
    fullPage: true,
  });
  const showPanel = page.getByRole("button", {
    name: "Show left panel",
    exact: true,
  });
  if (await showPanel.isVisible()) await showPanel.click();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a project" });
  await dialog
    .getByRole("button", { name: "Clone repository", exact: true })
    .click();
  const repository = dialog.getByRole("combobox", {
    name: "Git repository URL",
  });
  await expect(repository).toHaveAttribute("autocomplete", "off");
  await repository.fill("fluentci");
  await dialog
    .getByRole("option", {
      name: "tsiry-sandratraina.com/fluentci",
      exact: true,
    })
    .click();
  await expect(repository).toHaveValue(
    "https://knot1.tangled.sh/did:plc:zyxwvutsrqponmlkjihgfedcb",
  );
});

test("pins project tabs and promotes workflow controls into the header", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci/actions");
  await expect(
    page.getByRole("heading", { name: "Event triggers" }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 650));
  const nav = page.getByRole("navigation", { name: "Project tabs" });
  await expect
    .poll(async () => (await nav.boundingBox())?.y)
    .toBeGreaterThanOrEqual(56);
  await expect.poll(async () => (await nav.boundingBox())?.y).toBeLessThan(58);
  const controls = page.getByRole("group", {
    name: "Header workflow controls",
  });
  await expect(controls).toBeVisible();
  await expect(
    controls.getByRole("combobox", { name: "Workflow", exact: true }),
  ).toHaveValue("default");
  await expect(
    controls.getByRole("button", { name: "Manage workflow" }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("group", { name: "Header pipeline control" })
      .getByRole("button", { name: "Cancel pipeline" }),
  ).toBeEnabled();
  await controls.getByRole("button", { name: "New workflow" }).click();
  const dialog = page.getByRole("dialog", { name: "New workflow" });
  await dialog.getByLabel("Workflow ID").fill("release");
  await expect(
    dialog.getByText(/Saved in \.fluentci\/workflows\/release\.toml/),
  ).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill("Release");
  await dialog.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(/workflow=release/);
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Release actions" }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 650));
  await expect(
    controls.getByRole("combobox", { name: "Workflow", exact: true }),
  ).toHaveValue("release");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/sticky-workflow-header-${test.info().project.name}.png`,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByRole("group", { name: "Header workflow controls" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Workflow", exact: true }),
  ).toHaveValue("release");
});

test("suggests registry modules separately from local modules", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci/actions");
  const module = page.getByRole("combobox", {
    name: "Action 1 module",
    exact: true,
  });
  await module.fill("sccache");
  const local = page.getByRole("option", { name: "sccache", exact: true });
  const registry = page.getByRole("option", {
    name: "@fluentci.io/sccache@v0.1.0",
    exact: true,
  });
  await expect(local.getByText("Local", { exact: true })).toBeVisible();
  await expect(registry.getByText("Registry", { exact: true })).toBeVisible();
  await registry.click();
  await expect(module).toHaveValue("@fluentci.io/sccache@v0.1.0");
  await page
    .getByRole("combobox", {
      name: "Action 1 functions / commands",
      exact: true,
    })
    .fill("se");
  await page.getByRole("option", { name: "setup", exact: true }).click();
  await expect(
    page.getByRole("combobox", {
      name: "Action 1 functions / commands",
      exact: true,
    }),
  ).toHaveValue("setup");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("pins Git branch and pull controls, then reloads sources on branch switch", async ({
  page,
}) => {
  await page.goto("/project/local-fluentci/actions?fixture=git");
  await expect(page.getByRole("combobox", { name: "Git branch" })).toHaveValue(
    "main",
  );
  await page.evaluate(() => window.scrollTo(0, 650));
  const header = page.getByRole("group", { name: "Header Git controls" });
  await expect(header).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Project tabs" }),
  ).toHaveCSS("top", "96px");
  await header
    .getByRole("combobox", { name: "Git branch" })
    .selectOption("feature/docs");
  await expect(
    header.getByRole("combobox", { name: "Git branch" }),
  ).toHaveValue("feature/docs");
  await expect(page.getByRole("option", { name: "Branch checks" })).toHaveCount(
    1,
  );
  await header.getByRole("button", { name: "Pull Git changes" }).click();
  await expect(
    header.getByRole("button", { name: "Pull Git changes" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const element of [
    header.getByRole("combobox", { name: "Git branch" }),
    header.getByRole("button", { name: "Pull Git changes" }),
    page.getByRole("group", { name: "Header pipeline control" }),
  ]) {
    const bounds = await element.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  }
  await page.screenshot({
    path: `test-results/git-controls-${test.info().project.name}.png`,
  });
});

for (const git of [false, true]) {
  test(`pins an expanded job below tabs with Git header ${git ? "visible" : "hidden"}`, async ({
    page,
  }) => {
    await page.goto(
      `/project/local-fluentci?fixture=large${git ? "&git=1" : ""}`,
    );
    await page.getByRole("button", { name: "Following", exact: true }).click();
    const header = page.getByRole("group", { name: "Test engine job" });
    const section = header.locator("..");
    await expect(header).toBeVisible();
    await section.evaluate((element) =>
      window.scrollTo(
        0,
        window.scrollY + element.getBoundingClientRect().top - 50,
      ),
    );
    const tabs = page.getByRole("navigation", { name: "Project tabs" });
    await expect
      .poll(async () => {
        const tabBounds = await tabs.boundingBox();
        const jobBounds = await header.boundingBox();
        return Math.abs(jobBounds!.y - (tabBounds!.y + tabBounds!.height));
      })
      .toBeLessThan(2);
    if (git)
      await expect(
        page.getByRole("group", { name: "Header Git controls" }),
      ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Re-run job" }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/pinned-job-${git ? "git" : "plain"}-${test.info().project.name}.png`,
    });
    await header.getByRole("button", { name: /Test engine/ }).click();
    await expect(page.getByLabel("Test engine output")).not.toBeVisible();
  });
}
