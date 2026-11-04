// Extism guest bindings: no HTTP client or host runtime.
export const pipeline = name => Object.freeze({ name, steps: Object.freeze([]) });
const append = (value, step) => Object.freeze({ ...value, steps: Object.freeze([...value.steps, Object.freeze(step)]) });
export const exec = (value, args) => append(value, { kind: "exec", args: Object.freeze([...args]) });
export const shell = (value, command) => append(value, { kind: "shell", command });
export const workdir = (value, path) => append(value, { kind: "workdir", path });
export const env = (value, key, data) => append(value, { kind: "env", key, data });
const quote = value => {
  if (value.includes("\0")) throw Error("command arguments cannot contain NUL");
  return "'" + value.replace(/'/g, "'\\''") + "'";
};
const call = (name, input, output = false) => {
  const functions = Host.getFunctions();
  const offset = input === undefined ? functions[name]() : functions[name](Memory.fromString(input).offset);
  return output ? Memory.find(offset).readString() : undefined;
};
export function run(value, useStderr, ok, error) {
  try {
    call("set_runner", "default");
    call("pipeline", value.name, true);
    for (const step of value.steps) {
      if (step.kind === "exec") call("with_exec", JSON.stringify(step.args.map(quote)));
      if (step.kind === "shell") call("with_exec", JSON.stringify([step.command]));
      if (step.kind === "workdir") call("with_workdir", step.path);
      if (step.kind === "env") call("set_envs", JSON.stringify([[step.key, step.data]]));
    }
    return ok(call(useStderr ? "stderr" : "stdout", undefined, true));
  } catch (exception) {
    return error(exception instanceof Error ? exception.message : String(exception));
  }
}
