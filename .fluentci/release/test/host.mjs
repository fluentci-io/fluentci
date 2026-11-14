// Host bridge for compiled PureScript tests. Mock mode records operations;
// native mode executes literal argv/file operations in a disposable CI fixture.
// Neither mode launches FluentCI or reads real publishing credentials.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function fixture(env = {}, options = {}) {
  const inputs = {
    target: env.TARGET ?? "",
    version: env.RELEASE_VERSION ?? "",
    account: env.FURY_ACCOUNT ?? "",
  };
  const root = options.root ?? "/workspace";
  const calls = [];
  const writes = [];
  const output = [];
  let pending = [];
  let cwd = root;
  const arch = env.TARGET?.startsWith("aarch64") ? "arm64" : "amd64";
  const version = (env.RELEASE_VERSION ?? "v0.17.0")
    .replace(/^v/, "")
    .replaceAll("-", "~");
  const command = (args) => {
    calls.push(args);
    if (options.fail?.(args)) throw new Error("Injected command failure");
    if (options.native) {
      const result = spawnSync(args[0], args.slice(1), {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...env },
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`${args[0]}: ${result.stdout}\n${result.stderr}`);
      return result.stdout;
    }
    if (args[0] === "pwd") return root;
    if (args[0] === "mktemp") return "/tmp/fluentci-package-fixture";
    if (args[0] === "dpkg-deb" && args[1] === "--field")
      return args[3] === "Version" ? version : arch;
    if (args[0] === "rpm")
      return args.at(-2) === "%{VERSION}"
        ? version
        : arch === "arm64"
          ? "aarch64"
          : "x86_64";
    return "";
  };
  globalThis.Memory = {
    fromString: (value) => ({ offset: value }),
    find: (value) => ({ readString: () => value }),
  };
  globalThis.Host = {
    outputString: (value) => output.push(value),
    getFunctions: () =>
      new Proxy(
        {},
        {
          get: (_target, name) => (value) => {
            if (name === "has_env")
              return JSON.stringify(Object.hasOwn(env, value));
            if (name === "get_env") return env[value];
            if (name === "pipeline") {
              pending = [];
              cwd = root;
              return JSON.stringify({ id: "fixture" });
            }
            if (name === "with_workdir") cwd = resolve(root, value);
            if (name === "with_exec") {
              const args = JSON.parse(value).map((arg) => {
                if (!arg.startsWith("'") || !arg.endsWith("'"))
                  throw new Error("Packaging attempted shell execution");
                return arg.slice(1, -1).replaceAll("'\\''", "'");
              });
              pending.push(args);
            }
            if (name === "stdout") return pending.map(command).join("");
            if (name === "file") return JSON.stringify({ id: "file" });
            if (name === "sha256")
              return options.native
                ? createHash("sha256").update(readFileSync(value)).digest("hex")
                : "a".repeat(64);
            if (name === "execute_plan") {
              const request = JSON.parse(value);
              if (options.failWrite)
                return JSON.stringify({ outcome: "failed", tasks: [] });
              if (options.native) mkdirSync(request.run_dir);
              for (const task of request.plan.tasks) {
                const op = task.file_operation;
                if (op?.op !== "write_text")
                  throw new Error("Unexpected native operation");
                writes.push({ cwd: task.cwd, ...op });
                if (options.native) {
                  const path = resolve(task.cwd, op.path);
                  if (!op.overwrite && existsSync(path))
                    throw new Error("File already exists");
                  writeFileSync(path, op.text);
                }
              }
              return JSON.stringify({ outcome: "succeeded", tasks: [] });
            }
            return "";
          },
        },
      ),
  };
  return { inputs, calls, writes, output };
}
