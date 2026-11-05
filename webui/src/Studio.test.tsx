import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import App from "./App";
import { pipelineTimings } from "./pipelineTimings";
import { PipelineControl } from "./components/PipelineControl";
import { HistoryBars } from "./components/HistoryBars";
import { exportLogs, plainText } from "./components/RunView";
import { graphql, mergeLogs } from "./api";
import { makeLogs, makeRun, project } from "./mocks/fixtures";
import { createMockApi } from "./mocks/handlers";
import { server } from "../tests/server";
import type { Action } from "./types";

function renderApp(
  path = "/project/local-fluentci",
  options: Parameters<typeof createMockApi>[0] = {},
) {
  const api = createMockApi(options);
  server.use(...api.handlers);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <Provider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return { api, client, ...view };
}

describe("one state-aware pipeline control", () => {
  it.each([
    [undefined, "Run"],
    ["RUNNING", "Cancel"],
    ["PENDING", "Cancel"],
    ["SUCCESS", "Restart"],
    ["FAILURE", "Restart"],
    ["CANCELLED", "Restart"],
  ])("shows exactly one button for %s", async (status, label) => {
    const onRun = vi.fn();
    const onCancel = vi.fn();
    render(
      <PipelineControl
        run={status ? makeRun(status) : undefined}
        onRun={onRun}
        onCancel={onCancel}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: `${label} pipeline` }),
    );
    expect(label === "Cancel" ? onCancel : onRun).toHaveBeenCalledOnce();
    expect(label === "Cancel" ? onRun : onCancel).not.toHaveBeenCalled();
  });
  it("prevents duplicate requests while a control is pending", async () => {
    const onRun = vi.fn();
    render(<PipelineControl pending onRun={onRun} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onRun).not.toHaveBeenCalled();
  });
});

describe("local execution", () => {
  it("re-runs the selected job without expanding it or running the other jobs", async () => {
    renderApp("/project/local-fluentci", { status: "SUCCESS" });
    await screen.findByRole("button", { name: "Restart pipeline" });
    const buttons = await screen.findAllByRole("button", {
      name: "Re-run job",
    });
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("title", "Re-run job");
    await userEvent.click(buttons[0]);
    expect(
      await screen.findByText("Re-run Build Studio", { exact: false }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Build Studio/ }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(
      screen.getAllByRole("button", { name: "Re-run job" })[0],
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Test engine/ }),
    ).toHaveTextContent("Skipped");
  });

  it("shows a job re-run error and keeps the original output", async () => {
    renderApp("/project/local-fluentci", { status: "SUCCESS" });
    const buttons = await screen.findAllByRole("button", {
      name: "Re-run job",
    });
    server.use(
      http.post("*/graphql", async ({ request }) => {
        const body = (await request.json()) as { query: string };
        if (body.query.includes("jobName:"))
          return HttpResponse.json({
            errors: [{ message: "Job was removed" }],
          });
      }),
    );
    await userEvent.click(buttons[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Job was removed",
    );
    expect(
      screen.getByRole("button", { name: /Build Studio/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(buttons[0]).toBeEnabled();
  });

  it("opens the active step, collapses completed steps, and lets users toggle output", async () => {
    renderApp();
    const active = await screen.findByRole("button", { name: /Test engine/ });
    expect(active).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Build Studio/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      await screen.findByText("test executor::tests::persists_output ... ok"),
    ).toBeVisible();
    await userEvent.click(active);
    expect(active).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      screen.getByRole("button", { name: "Expand all steps" }),
    );
    expect(active).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Build Studio/ }),
    ).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse all steps" }),
    );
    expect(active).toHaveAttribute("aria-expanded", "false");
  });

  it("cancels a running pipeline and restarts it with a fresh run", async () => {
    const { api } = renderApp();
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel pipeline" }),
    );
    expect(
      await screen.findByRole("button", { name: "Restart pipeline" }),
    ).toBeEnabled();
    expect(api.runs[0].status).toBe("CANCELLED");
    await userEvent.click(
      screen.getByRole("button", { name: "Restart pipeline" }),
    );
    expect(
      await screen.findByRole("button", { name: "Cancel pipeline" }),
    ).toBeEnabled();
    expect(api.runs[0].id).not.toBe("run-current");
    expect(api.runs[0].status).toBe("RUNNING");
  });

  it("renders WebSocket output immediately and deduplicates snapshot recovery", async () => {
    const { api, client } = renderApp();
    await screen.findByRole("button", { name: "Cancel pipeline" });
    await waitFor(() => expect(api.events.clients.size).toBeGreaterThan(0));
    await waitFor(() =>
      expect(client.getQueryData(["logs", "run-current-job-1"])).toBeDefined(),
    );
    act(() => {
      api.addLog("live line from the executor");
    });
    expect(
      await screen.findByText("live line from the executor"),
    ).toBeVisible();
    await act(() =>
      client.invalidateQueries({ queryKey: ["logs", "run-current-job-1"] }),
    );
    expect(screen.getAllByText("live line from the executor")).toHaveLength(1);
  });

  it("recovers lines persisted during a disconnection", async () => {
    const { api } = renderApp();
    await screen.findByRole("button", { name: "Cancel pipeline" });
    await waitFor(() => expect(api.events.clients.size).toBeGreaterThan(0));
    act(() => {
      for (const client of api.events.clients) client.close();
    });
    await screen.findByText("Reconnecting · recovering logs");
    api.addLog("persisted while disconnected");
    expect(
      await screen.findByText(
        "persisted while disconnected",
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible();
    await screen.findByText("Connected · live updates");
  });

  it("searches all steps, highlights results, and supports clearing", async () => {
    renderApp();
    const search = await screen.findByRole("textbox", { name: "Search logs" });
    await screen.findByText("test executor::tests::persists_output ... ok");
    await userEvent.type(search, "bun");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Build Studio/ }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(screen.getAllByText("bun", { selector: "mark" })).toHaveLength(2);
    expect(screen.getByText("1/2")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2/2")).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "no-such-output");
    expect(screen.getByText("No matches")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear log search" }),
    );
    expect(search).toHaveValue("");
  });

  it("exports every step even while a log search filters the visible output", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderApp();
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Search logs" }),
      "bun",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Download logs" }),
    );
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("fluentci-run-curr.txt");
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const run = makeRun("SUCCESS");
    const all = makeLogs(run);
    const text = exportLogs(
      run,
      new Map(
        run.jobs.map((job) => [
          job.id,
          all.filter((log) => log.jobId === job.id),
        ]),
      ),
    );
    expect(text).toContain("Build Studio");
    expect(text).toContain("Test engine");
    expect(text).toContain("cargo build --release --locked");
    expect(plainText("\u001b[31merror\u001b[0m")).toBe("error");
  });

  it("shows GraphQL errors without claiming the pipeline started", async () => {
    renderApp("/project/local-fluentci", { status: "SUCCESS" });
    await screen.findByRole("button", { name: "Restart pipeline" });
    server.use(
      http.post("*/graphql", async ({ request }) => {
        const body = (await request.json()) as { query: string };
        if (body.query.includes("runPipeline"))
          return HttpResponse.json({
            errors: [{ message: "No actions configured" }],
          });
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restart pipeline" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No actions configured",
    );
    expect(
      screen.getByRole("button", { name: "Restart pipeline" }),
    ).toBeEnabled();
  });

  it("opens quick search with the keyboard and navigates to an action", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Cancel pipeline" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Quick search" });
    await userEvent.type(within(dialog).getByRole("combobox"), "edit pipeline");
    expect(within(dialog).getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(await screen.findByText("Pipeline actions")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits and saves ordered actions using the GraphQL API", async () => {
    renderApp("/project/local-fluentci/actions", { status: "SUCCESS" });
    const input = await screen.findByRole("textbox", { name: "Action 1 name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Build frontend");
    await userEvent.click(
      screen.getByRole("button", { name: "Move action 1 down" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save actions" }));
    await screen.findByRole("button", { name: "Saved" });
    const data = await graphql<{ actions: Action[] }>(
      "query($id: ID!) { actions(projectId: $id) { name } }",
      { id: project.id },
    );
    expect(data.actions[1].name).toBe("Build frontend");
    expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
  });

  it("retains unsaved action drafts across tabs and prevents running stale actions", async () => {
    renderApp("/project/local-fluentci/actions", { status: "SUCCESS" });
    const input = await screen.findByRole("textbox", { name: "Action 1 name" });
    await userEvent.clear(input);
    await userEvent.type(input, "My unsaved build");
    await userEvent.click(screen.getByRole("link", { name: "Execution" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Restart pipeline" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save your action changes",
    );
    await userEvent.click(screen.getByRole("link", { name: "Actions" }));
    expect(
      await screen.findByRole("textbox", { name: "Action 1 name" }),
    ).toHaveValue("My unsaved build");
  });

  it("finds saved logs from quick search and opens the matching step", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Cancel pipeline" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "Quick search" });
    await userEvent.type(within(dialog).getByRole("combobox"), "transformed");
    const options = await within(dialog).findAllByRole("option");
    expect(options[0]).toHaveTextContent("Log · Build Studio");
    await userEvent.click(options[0]);
    expect(
      await screen.findByRole("button", { name: /Build Studio/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("✓ 148 modules transformed")).toBeVisible();
  });
});

describe("build history", () => {
  it("gives each bar an accessible tooltip and a run link", async () => {
    const run = makeRun("SUCCESS");
    render(
      <MemoryRouter>
        <HistoryBars runs={[run]} projectId={project.id} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /Passed/ });
    expect(link).toHaveAttribute(
      "href",
      `/project/${project.id}/run/${run.id}`,
    );
    await userEvent.tab();
    expect(link).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Passed");
    expect(screen.getByRole("tooltip")).toHaveTextContent("1m 24s");
  });
  it("preserves streamed lines when a persisted snapshot overlaps", () => {
    const logs = makeLogs(makeRun("SUCCESS"));
    const result = mergeLogs(logs.slice(0, 3), logs.slice(2, 5));
    expect(result).toHaveLength(5);
    expect(new Set(result.map((log) => log.id)).size).toBe(5);
  });
});

describe("validated Studio forms", () => {
  it("rejects blank step names and malformed environment variables without saving", async () => {
    renderApp("/project/local-fluentci/actions");
    const name = await screen.findByRole("textbox", { name: "Action 1 name" });
    await userEvent.clear(name);
    await userEvent.type(name, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save actions" }));
    expect(await screen.findByText("Enter a step name.")).toBeVisible();
    const data = await graphql<{ actions: Action[] }>(
      "query($id: ID!) { actions(projectId: $id) { name } }",
      { id: project.id },
    );
    expect(data.actions[0].name.trim()).not.toBe("");
    await userEvent.clear(name);
    await userEvent.type(name, "Build");
    const env = screen.getAllByLabelText(/Environment variables/)[0];
    await userEvent.clear(env);
    await userEvent.type(env, "INVALID");
    await userEvent.click(screen.getByRole("button", { name: "Save actions" }));
    expect(
      await screen.findByText("Use KEY=value, one variable per line."),
    ).toBeVisible();
  });

  it("selects modules, functions, and project directories with the keyboard", async () => {
    renderApp("/project/local-fluentci/actions");
    const module = await screen.findByRole("combobox", {
      name: "Action 1 module",
    });
    await userEvent.clear(module);
    await userEvent.type(module, "rus");
    await screen.findByRole("option", { name: "rust" });
    await userEvent.keyboard("{Enter}");
    expect(module).toHaveValue("rust");
    const commands = screen.getByRole("combobox", {
      name: "Action 1 functions / commands",
    });
    await userEvent.clear(commands);
    await userEvent.type(commands, "bu");
    await screen.findByRole("option", { name: "build" });
    await userEvent.keyboard("{Tab}");
    expect(commands).toHaveValue("build");
    fireEvent.change(commands, {
      target: { value: "build --release\nte", selectionStart: 18 },
    });
    await userEvent.keyboard("{Enter}");
    expect(commands).toHaveValue("build --release\ntest");
    const directory = screen.getByRole("combobox", {
      name: "Action 1 working directory",
    });
    await userEvent.clear(directory);
    await userEvent.type(directory, "webui/s");
    await screen.findByRole("option", { name: "webui/src" });
    await userEvent.keyboard("{Enter}");
    expect(directory).toHaveValue("webui/src");
    await userEvent.click(screen.getByRole("button", { name: "Save actions" }));
    await screen.findByRole("button", { name: "Saved" });
  });

  it("validates project names and saves the name separately from its display name", async () => {
    renderApp("/project/local-fluentci/settings");
    const name = await screen.findByRole("textbox", {
      name: "Project name",
    });
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a project name.")).toBeVisible();
    await userEvent.type(name, "renamed-project");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changes saved.")).toBeVisible();
    const data = await graphql<{
      project: { name: string; displayName: string };
    }>("query($id: ID!) { project(id: $id) { name displayName } }", {
      id: project.id,
    });
    expect(data.project.name).toBe("renamed-project");
    expect(data.project.displayName).toBe(project.displayName);
  });

  it("rejects a name that became taken at save time", async () => {
    renderApp("/project/local-fluentci/settings");
    const name = await screen.findByRole("textbox", {
      name: "Project name",
    });
    server.use(
      http.post("*/graphql", async ({ request }) => {
        const { query } = (await request.json()) as { query: string };
        if (query.includes("updateProject"))
          return HttpResponse.json({
            errors: [{ message: "A project with this name already exists." }],
          });
      }),
    );
    await userEvent.clear(name);
    await userEvent.type(name, "taken");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(screen.queryByText("Changes saved.")).not.toBeInTheDocument();
  });

  it("validates Git URLs before cloning", async () => {
    renderApp("/");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Add project" })[0],
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Clone repository" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add a project" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Git repository URL" }),
      "not a git url",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Clone and add project" }),
    );
    expect(
      await within(dialog).findByText(
        "Enter a Git repository URL (HTTPS or SSH).",
      ),
    ).toBeVisible();
  });
});

describe("pipeline spans", () => {
  it("grows running spans but keeps recorded runs fixed and leaves unstarted steps unpositioned", () => {
    const run = makeRun();
    const start = Date.parse(run.date);
    const first = pipelineTimings(run, start + 60_000);
    const later = pipelineTimings(run, start + 65_000);
    expect(later.spans[1].elapsed - first.spans[1].elapsed).toBe(5000);
    expect(later.spans[2].offset).toBeNull();
    const complete = makeRun("SUCCESS");
    expect(pipelineTimings(complete, start + 100_000)).toEqual(
      pipelineTimings(complete, start + 500_000),
    );
  });
  it("opens span details in step logs and restores the spans view from the URL", async () => {
    renderApp("/project/local-fluentci?view=spans");
    const span = await screen.findByRole("button", {
      name: "Inspect Build Studio span",
    });
    expect(screen.getByRole("button", { name: "Spans" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "Pipeline spans" }),
    ).toBeVisible();
    await userEvent.click(span);
    expect(
      await screen.findByRole("button", { name: /Build Studio/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("✓ 148 modules transformed")).toBeVisible();
  });
});

it("follows the next active step and resumes after inspecting older output", async () => {
  const { api } = renderApp();
  await screen.findByRole("button", { name: /Test engine/ });
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  fireEvent.wheel(screen.getByLabelText("Test engine output"), {
    deltaY: -100,
  });
  await screen.findByRole("button", { name: "Paused" });
  scroll.mockClear();
  act(() => {
    api.runs[0].jobs[1].status = "SUCCESS";
    api.runs[0].jobs[2].status = "RUNNING";
    api.runs[0].jobs[2].startedAt = new Date().toISOString();
    api.publish("job", api.runs[0].jobs[1]);
    api.publish("job", api.runs[0].jobs[2]);
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Build release/ }),
    ).toHaveAttribute("aria-expanded", "true"),
  );
  expect(scroll).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Paused" }));
  await waitFor(() =>
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" }),
  );
  expect(screen.getByRole("button", { name: "Following" })).toBeVisible();
});
