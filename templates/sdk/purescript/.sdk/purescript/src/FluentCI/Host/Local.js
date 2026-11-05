import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export const executeImpl = config => encoded => (onError, onSuccess) => {
  let child;
  let cancelled = false;
  const finished = (async () => {
    try {
      const root = resolve(config.runRoot);
      await mkdir(root, { recursive: true, mode: 0o700 });
      const directory = await mkdtemp(join(root, "run-"));
      const plan = JSON.parse(encoded);
      if (plan.workspace) plan.workspace.source = resolve(plan.workspace.source);
      else for (const task of plan.tasks) task.cwd = resolve(task.cwd);
      for (const key of ["cache_dir", "resource_dir"]) if (plan[key] !== null && plan[key] !== undefined) plan[key] = resolve(plan[key]);
      const manifest = join(directory, "plan.json");
      const runDirectory = join(directory, "execution");
      await writeFile(manifest, JSON.stringify(plan), { mode: 0o600, flag: "wx" });
      if (cancelled) return;
      const code = await new Promise((resolveExit, reject) => {
        child = spawn(config.binary, ["execute", manifest, "--run-dir", runDirectory, "--progress", config.progress], { stdio: ["ignore", "inherit", "inherit"] });
        child.once("error", reject);
        child.once("close", resolveExit);
      });
      if (cancelled) return;
      let report;
      try { report = await readFile(join(runDirectory, "result.json"), "utf8"); }
      catch (_) { throw new Error(`engine exited (${code}) without a result report`); }
      if (!cancelled) onSuccess({ runDirectory, report });
    } catch (error) {
      if (!cancelled) onError(error instanceof Error ? error : new Error("local execution failed"));
    }
  })();
  return (_error, _onError, onSuccess) => {
    cancelled = true;
    // Wait for the engine to clean up its task/service process groups. Do not
    // detach or hard-kill it and leave child commands holding writable state.
    child?.kill("SIGINT");
    finished.then(() => onSuccess(), () => onSuccess());
  };
};
