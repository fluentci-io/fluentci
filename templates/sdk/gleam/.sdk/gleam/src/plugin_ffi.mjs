// Pure constructors. No Node/Deno APIs or Extism host runtime are imported.
export const exec_step = (program, args) => Object.freeze({ kind: "exec", args: Object.freeze([program, ...args]) });
export const shell_step = command => Object.freeze({ kind: "shell", command });
export const workdir_step = path => Object.freeze({ kind: "workdir", path });
export const env_step = (key, value) => Object.freeze({ kind: "env", key, value });
export const cache_step = (key, path) => Object.freeze({ kind: "cache", key, path });
export const provider_step = (name, impure) => Object.freeze({ kind: "provider", name, impure });
export const service_step = (name, source, steps) => Object.freeze({ kind: "service", name, source, steps: Object.freeze([...steps]) });

const quote = value => {
  if (value.includes("\0")) throw Error("command arguments cannot contain NUL");
  return "'" + value.replace(/'/g, "'\\''") + "'";
};
const call = (name, input, output = false) => {
  const functions = Host.getFunctions();
  if (typeof functions[name] !== "function") throw Error(`FluentCI engine does not expose ${name}`);
  const result = input === undefined ? functions[name]() : functions[name](Memory.fromString(input).offset);
  return output ? Memory.find(result).readString() : undefined;
};
const identity = document => {
  const value = JSON.parse(document);
  if (typeof value.id !== "string") throw Error("FluentCI returned an invalid handle");
  return value.id;
};
function emit(name, steps) {
  const services = steps.filter(step => step.kind === "service").map(step => {
    emit(step.source, step.steps);
    return identity(call("as_service", step.name, true));
  });
  call("set_runner", "default");
  call("pipeline", name, true);
  services.forEach(id => call("with_service", id));
  for (const step of steps) {
    switch (step.kind) {
      case "exec": call("with_exec", JSON.stringify(step.args.map(quote))); break;
      case "shell": call("with_exec", JSON.stringify([step.command])); break;
      case "workdir": call("with_workdir", step.path); break;
      case "env": call("set_envs", JSON.stringify([[step.key, step.value]])); break;
      case "cache": {
        const id = identity(call("cache", step.key, true));
        call("with_cache", JSON.stringify({ id, key: step.key, path: step.path }));
        break;
      }
      case "provider":
        call("set_runner", step.name);
        call(step.name, step.name === "nix" ? JSON.stringify({ impure: step.impure }) : undefined, true);
        break;
    }
  }
}
export function run(name, steps, stderr, ok, error) {
  try {
    emit(name, [...steps]);
    return ok(call(stderr ? "stderr" : "stdout", undefined, true));
  } catch (exception) {
    return error(exception instanceof Error ? exception.message : String(exception));
  }
}
