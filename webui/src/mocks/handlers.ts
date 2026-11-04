import { http, HttpResponse, ws } from "msw";
import {
  actions as initialActions,
  makeHistory,
  makeLogs,
  makeRun,
  project as initialProject,
} from "./fixtures";
import type { Action, Log, Project, Run } from "../types";

// A single link keeps MSW's BroadcastChannel listener shared across scenarios.
const events = ws.link(/\/ws$/);

export function createMockApi({
  status = "RUNNING",
  empty = false,
  stream = false,
  largeLogs = false,
  noRuns = false,
}: {
  status?: string;
  empty?: boolean;
  stream?: boolean;
  largeLogs?: boolean;
  noRuns?: boolean;
} = {}) {
  let projects: Project[] = empty ? [] : [{ ...initialProject }];
  let actions = structuredClone(initialActions);
  const runs: Run[] =
    empty || noRuns ? [] : [makeRun(status), ...makeHistory()];
  const logs = runs.flatMap(makeLogs);
  if (largeLogs && runs[0]) {
    const job = runs[0].jobs[1];
    logs.push(
      ...Array.from({ length: 10_000 }, (_, index) => ({
        id: `stress-${index}`,
        jobId: job.id,
        message: `large-output-line-${String(index).padStart(5, "0")} ... ok`,
        createdAt: new Date(Date.now() + index).toISOString(),
      })),
    );
  }
  let streamedLines = 0;
  const publish = (channel: string, data: unknown) =>
    events.broadcast(JSON.stringify({ channel, data }));
  const addLog = (
    message: string,
    run = runs[0],
    job = run.jobs.find((item) => item.status === "RUNNING") || run.jobs[1],
  ) => {
    const log: Log = {
      id: crypto.randomUUID(),
      jobId: job.id,
      message,
      createdAt: new Date().toISOString(),
    };
    logs.push(log);
    publish("logs", {
      id: log.id,
      createdAt: log.createdAt,
      jobId: log.jobId,
      text: log.message,
      runId: run.id,
      projectId: run.projectId,
    });
    return log;
  };
  return {
    runs,
    logs,
    events,
    addLog,
    publish,
    handlers: [
      http.post("*/graphql", async ({ request }) => {
        const { query, variables: v = {} } = (await request.json()) as {
          query: string;
          variables?: Record<string, unknown>;
        };
        let data: Record<string, unknown>;
        if (/\bsearch\s*\(/.test(query)) {
          const tokens = String(v.query || "")
            .toLowerCase()
            .split(/\W+/)
            .filter(Boolean);
          data = {
            search: logs
              .filter((log) =>
                tokens.every((token) =>
                  log.message.toLowerCase().includes(token),
                ),
              )
              .slice(0, 30)
              .map((log) => {
                const run = runs.find((run) =>
                  run.jobs.some((job) => job.id === log.jobId),
                )!;
                return {
                  id: log.id,
                  kind: "LOG",
                  projectId: run.projectId,
                  runId: run.id,
                  jobId: log.jobId,
                  title: run.jobs.find((job) => job.id === log.jobId)!.name,
                  excerpt: log.message,
                  createdAt: log.createdAt,
                };
              }),
          };
        } else if (/\bprojectNameAvailable\s*\(/.test(query)) {
          data = {
            projectNameAvailable: !projects.some(
              (project) =>
                project.id !== v.id &&
                project.name.trim().toLowerCase() ===
                  String(v.name).trim().toLowerCase(),
            ),
          };
        } else if (/\bprojectDirectories\s*\(/.test(query)) {
          data = { projectDirectories: [".", "src", "webui", "webui/src"] };
        } else if (/\bactionSuggestions\s*\(/.test(query)) {
          data = {
            actionSuggestions: [
              { name: ".", functions: ["build", "test", "release"] },
              { name: "rust", functions: ["build", "test", "fmt", "clippy"] },
              { name: "bun", functions: ["install", "run", "test"] },
            ],
          };
        } else if (/\bprojects\s*\(/.test(query)) data = { projects };
        else if (/\bproject\s*\(/.test(query))
          data = { project: projects.find((item) => item.id === v.id) || null };
        else if (/\bgetRuns\s*\(/.test(query))
          data = { getRuns: runs.filter((run) => run.projectId === v.id) };
        else if (/\bgetRun\s*\(/.test(query))
          data = { getRun: runs.find((run) => run.id === v.id) || null };
        else if (/\blogs\s*\(/.test(query))
          data = { logs: logs.filter((log) => log.jobId === v.id) };
        else if (/\bactions\s*\(/.test(query)) data = { actions };
        else if (/\bsaveActions\s*\(/.test(query)) {
          actions = v.actions as Action[];
          data = { saveActions: actions };
        } else if (/\brunPipeline\s*\(/.test(query)) {
          const run = makeRun("RUNNING", crypto.randomUUID());
          run.date = new Date().toISOString();
          runs.unshift(run);
          data = { runPipeline: run };
          publish("run", run);
        } else if (/\bcancelRun\s*\(/.test(query)) {
          const run = runs.find((item) => item.id === v.id)!;
          run.status = "CANCELLED";
          run.jobs.forEach((job) => {
            if (["PENDING", "RUNNING"].includes(job.status))
              job.status = "CANCELLED";
          });
          data = { cancelRun: run };
          publish("run", run);
        } else if (/\bexportActions\s*\(/.test(query))
          data = {
            exportActions: `# ${v.provider} · generated from saved actions\nname: ci\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: fluentci run .\n`,
          };
        else if (/\bcreateProject\s*\(/.test(query)) {
          const project = {
            ...initialProject,
            id: crypto.randomUUID(),
            name: "new-project",
            displayName: "New project",
          };
          projects.push(project);
          data = { createProject: project };
        } else if (/\bupdateProject\s*\(/.test(query)) {
          const project = projects.find((item) => item.id === v.id)!;
          if (
            v.projectName &&
            projects.some(
              (other) =>
                other.id !== v.id &&
                other.name.toLowerCase() ===
                  String(v.projectName).trim().toLowerCase(),
            )
          )
            return HttpResponse.json({
              errors: [{ message: "A project with this name already exists." }],
            });
          Object.assign(project, {
            name: v.projectName ? String(v.projectName).trim() : project.name,
            displayName: v.name,
            description: v.description,
            tags: String(v.tags).split(","),
          });
          data = { updateProject: project };
        } else if (/\bunarchiveProject\s*\(/.test(query)) {
          const project = projects.find((item) => item.id === v.id)!;
          project.archived = false;
          data = { unarchiveProject: project };
        } else if (/\barchiveProject\s*\(/.test(query)) {
          const project = projects.find((item) => item.id === v.id)!;
          project.archived = true;
          data = { archiveProject: project };
        } else if (/\bdeleteProject\s*\(/.test(query)) {
          projects = projects.filter((item) => item.id !== v.id);
          data = { deleteProject: true };
        } else
          return HttpResponse.json(
            { errors: [{ message: "Unhandled mock GraphQL operation" }] },
            { status: 400 },
          );
        return HttpResponse.json({ data });
      }),
      events.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", () =>
          client.send(JSON.stringify({ channel: "heartbeat", data: {} })),
        );
        if (!stream) return;
        const timer = setInterval(() => {
          const run = runs.find((item) => item.status === "RUNNING");
          if (run)
            addLog(
              `test pipeline::integration::case_${String(++streamedLines).padStart(3, "0")} ... ok`,
              run,
            );
        }, 900);
        client.addEventListener("close", () => clearInterval(timer));
      }),
    ],
  };
}
