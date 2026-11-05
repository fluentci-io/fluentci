import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

export function start(encoded, binary, root, progress) {
  const cwd = process.cwd(), env = { ...process.env };
  const execution = { child: undefined, cancelled: false };
  execution.finished = (async () => {
    try {
      const cancelled = () => {
        if (execution.cancelled) throw Error("execution cancelled before launch");
      };
      cancelled();
      const base = resolve(cwd, root);
      await mkdir(base, { recursive: true, mode: 0o700 });
      cancelled();
      const directory = await mkdtemp(join(base, "run-"));
      const plan = JSON.parse(encoded);
      if (plan.workspace) plan.workspace.source = resolve(cwd, plan.workspace.source);
      else for (const task of plan.tasks) task.cwd = resolve(cwd, task.cwd);
      for (const key of ["cache_dir", "resource_dir"]) if (plan[key] != null) plan[key] = resolve(cwd, plan[key]);
      const manifest = join(directory, "plan.json"), runDirectory = join(directory, "execution");
      await writeFile(manifest, JSON.stringify(plan), { mode: 0o600, flag: "wx" });
      cancelled();
      const code = await new Promise((resolveExit, reject) => {
        const child = spawn(binary, ["execute", manifest, "--run-dir", runDirectory, "--progress", progress], {
          cwd, env, stdio: ["ignore", "inherit", "inherit"],
        });
        execution.child = child;
        child.once("error", reject);
        child.once("close", code => { execution.child = undefined; resolveExit(code); });
      });
      let report;
      try { report = await readFile(join(runDirectory, "result.json"), "utf8"); }
      catch { throw Error(`engine exited (${code}) without a result report`); }
      return { ok: true, runDirectory, report };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "local execution failed" };
    }
  })();
  return execution;
}
export async function wait(execution, ok, error) {
  const value = await execution.finished;
  return value.ok ? ok(value.runDirectory, value.report) : error(value.error);
}
export async function cancel(execution) {
  execution.cancelled = true;
  execution.child?.kill("SIGINT");
  await execution.finished;
  return undefined;
}
