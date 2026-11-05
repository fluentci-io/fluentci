import type { Action, Log, Project, Run } from "../types";

export const project: Project = {
  id: "local-fluentci",
  name: "fluentci",
  displayName: "fluentci",
  description:
    "The local-first pipeline engine. Build, test, and release from one workspace.",
  path: "/workspace/fluentci",
  archived: false,
  tags: ["rust", "cli"],
};

export const actions: Action[] = [
  {
    name: "Build Studio",
    plugin: "bun",
    commands: "install\nrun build:web",
    enabled: true,
    useWasm: true,
    workingDirectory: "webui",
    env: ["CI=true"],
  },
  {
    name: "Test engine",
    plugin: "cargo",
    commands: "test --release --locked",
    enabled: true,
    useWasm: true,
    workingDirectory: null,
    env: [],
  },
  {
    name: "Build release",
    plugin: "cargo",
    commands: "build --release --locked",
    enabled: true,
    useWasm: true,
    workingDirectory: null,
    env: [],
  },
];

export function makeRun(status = "RUNNING", id = "run-current"): Run {
  const active = status === "RUNNING" || status === "PENDING";
  const started = new Date(Date.now() - 42_000).toISOString();
  return {
    id,
    projectId: project.id,
    title: "Run fluentci",
    status,
    date: started,
    duration: active ? 0 : 84_000,
    branch: "main",
    commit: "e4c98f23d",
    message:
      status === "FAILURE" ? 'Action "Test engine" exited with status 1' : null,
    jobs: actions.map((action, index) => ({
      id: `${id}-job-${index}`,
      name: action.name,
      status:
        status === "PENDING"
          ? "PENDING"
          : status === "RUNNING"
            ? index === 0
              ? "SUCCESS"
              : index === 1
                ? "RUNNING"
                : "PENDING"
            : status === "FAILURE"
              ? index === 0
                ? "SUCCESS"
                : index === 1
                  ? "FAILURE"
                  : "SKIPPED"
              : status === "CANCELLED"
                ? index === 0
                  ? "SUCCESS"
                  : "CANCELLED"
                : "SUCCESS",
      createdAt: started,
      startedAt: index < 2 || !active ? started : null,
      duration: index === 0 ? 12_000 : active ? null : 36_000,
    })),
  };
}

export function makeHistory() {
  return Array.from({ length: 24 }, (_, index) => ({
    ...makeRun(
      index === 7 || index === 15 ? "FAILURE" : "SUCCESS",
      `run-${24 - index}`,
    ),
    date: new Date(Date.now() - (index + 1) * 3_600_000).toISOString(),
    duration: 25_000 + ((index * 7919) % 100_000),
  }));
}

export function makeLogs(run: Run): Log[] {
  return run.jobs.flatMap((job, index) => {
    const output =
      index === 0
        ? [
            "$ bun install --frozen-lockfile",
            "Checked 312 installs across 346 packages",
            "$ bun run build:web",
            "vite building for production…",
            "✓ 148 modules transformed",
            "✓ built in 1.42s",
          ]
        : index === 1
          ? [
              "$ cargo test --release --locked",
              "   Compiling fluentci v0.16.8",
              "    Finished release profile [optimized]",
              "     Running unittests src/lib.rs",
              "running 128 tests",
              "test pipeline::tests::parses_commands ... ok",
              "test executor::tests::persists_output ... ok",
              ...(run.status === "FAILURE"
                ? [
                    "error: assertion failed: expected exit code 0",
                    "test executor::tests::run_pipeline ... FAILED",
                  ]
                : ["test workspace::tests::discovers_root ... ok"]),
            ]
          : job.status === "SUCCESS"
            ? [
                "$ cargo build --release --locked",
                "    Finished release profile [optimized] in 36.2s",
              ]
            : [];
    return output.map((message, i) => ({
      id: `${job.id}-log-${i}`,
      jobId: job.id,
      message,
      createdAt: new Date(
        new Date(run.date).getTime() + index * 13_000 + i * 100,
      ).toISOString(),
    }));
  });
}
