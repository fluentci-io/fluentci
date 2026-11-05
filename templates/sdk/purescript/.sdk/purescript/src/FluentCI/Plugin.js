// Immutable guest data. Engine imports are injected from the generated module.
const frozen = value => Object.freeze(value);
export const pipeline = name => frozen({ name, steps: frozen([]) });
const append = (value, step) => frozen({ ...value, steps: frozen([...value.steps, frozen(step)]) });
export const exec = args => value => append(value, { kind: "exec", args: frozen([...args]) });
export const shell = command => value => append(value, { kind: "shell", command });
export const withWorkdir = path => value => append(value, { kind: "workdir", path });
export const withEnv = key => data => value => append(value, { kind: "env", key, data });
export const cache = key => frozen({ key });
export const withCache = path => source => value => append(value, { kind: "cache", key: source.key, path });
export const providerImpl = name => impure => value => append(value, { kind: "provider", name, impure });
export const withPackages = packages => value => append(value, { kind: "packages", packages: frozen([...packages]) });
export const asService = name => source => frozen({ name, source });
export const withService = service => value => append(value, { kind: "service", service });
export const waitOn = port => timeout => value => append(value, { kind: "wait", port, timeout });
export const file = path => frozen({ path });
export const filePath = value => value.path;
export const copyFile = destination => source => exec(["/bin/cp", "--", source.path, destination]);
export const secret = name => data => frozen({ kind: "value", name, data });
export const withSecret = key => source => value => append(value, { kind: "secret", key, source });

const failure = (kind, operation, message) => Object.assign(new Error(message), { kind, operation });
const invalid = (operation, message) => { throw failure("invalid-input", operation, message); };
function text(value, operation, empty = false) {
  if (typeof value !== "string" || (!empty && value.length === 0) || value.includes("\0"))
    invalid(operation, "Expected a string without NUL" + (empty ? "" : " (nonempty)"));
}
function environmentKey(key, operation) {
  text(key, operation);
  if (key.includes("=")) invalid(operation, "Environment keys cannot contain '='");
}
const providers = new Set(["default", "nix", "devbox", "devenv", "envhub", "flox", "hermit", "mise", "pixi", "pkgx", "proto"]);
function validatePipeline(value, ancestors = new Set()) {
  if (!value || ancestors.has(value)) invalid("pipeline", "Cyclic or missing pipeline");
  text(value.name, "pipeline");
  const next = new Set(ancestors).add(value);
  let provider = "default";
  for (const step of value.steps) {
    switch (step.kind) {
      case "exec":
        if (step.args.length === 0) invalid("exec", "A program is required");
        step.args.forEach((arg, index) => text(arg, "exec", index !== 0));
        break;
      case "shell": text(step.command, "shell"); break;
      case "workdir": text(step.path, "withWorkdir"); break;
      case "env": environmentKey(step.key, "withEnv"); text(step.data, "withEnv", true); break;
      case "cache":
        text(step.key, "withCache"); text(step.path, "withCache");
        if (!/^[A-Za-z0-9_.-]+$/.test(step.key) || !/^[A-Za-z0-9_./-]+$/.test(step.path) || step.path.split("/").pop().startsWith("-"))
          invalid("withCache", "Legacy cache keys/paths require shell-safe characters; use host-plan action caching for arbitrary paths");
        break;
      case "provider":
        if (!providers.has(step.name)) invalid("using", "Unknown provider");
        provider = step.name;
        break;
      case "packages":
        if (provider !== "pkgx") invalid("withPackages", "The host import supports Pkgx; select using Pkgx first");
        if (!step.packages.length) invalid("withPackages", "At least one package is required");
        step.packages.forEach(item => text(item, "withPackages"));
        break;
      case "wait":
        if (!Number.isInteger(step.port) || step.port < 1 || step.port > 65535 || !Number.isInteger(step.timeout) || step.timeout < 1)
          invalid("waitOn", "Expected port 1..65535 and a positive timeout in seconds");
        break;
      case "service": text(step.service.name, "asService"); validatePipeline(step.service.source, next); break;
      case "secret":
        environmentKey(step.key, "withSecret"); text(step.source.name, "withSecret");
        if (step.source.kind === "value") text(step.source.data, "withSecret", true);
        else text(step.source.id, "withSecret");
        break;
      default: invalid("pipeline", "Unknown pipeline operation");
    }
  }
}
function result(makeError, left, right, operation, action) {
  try { return right(action()); }
  catch (error) {
    return left(makeError(error.kind || "host-failure")(error.operation || operation)(error.message || String(error)));
  }
}
export const validateImpl = makeError => left => right => value =>
  result(makeError, left, right, "validate", () => { validatePipeline(value); });
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const caller = invoke => (name, input = "") => invoke(name)(input)();
function jsonResponse(raw, operation) {
  try { return JSON.parse(raw); }
  catch (_) { throw failure("invalid-response", operation, "Expected JSON from the engine"); }
}
function identity(raw, operation) {
  const value = jsonResponse(raw, operation);
  if (!value || typeof value.id !== "string" || !value.id)
    throw failure("invalid-response", operation, "Expected a nonempty handle ID");
  return value.id;
}
// cache() resets the engine's compatibility graph. Resolve all cache handles
// before registering any services or lowering pipeline steps.
function prepareCaches(value, call, caches) {
  for (const step of value.steps) {
    if (step.kind === "service") prepareCaches(step.service.source, call, caches);
    if (step.kind === "cache" && !caches.has(step.key))
      caches.set(step.key, identity(call("cache", step.key), "cache"));
  }
}
function emit(value, call, services, secrets, caches) {
  const serviceIds = [];
  for (const step of value.steps) {
    if (step.kind !== "service") continue;
    if (!services.has(step.service)) {
      emit(step.service.source, call, services, secrets, caches);
      services.set(step.service, identity(call("as_service", step.service.name), "as_service"));
    }
    serviceIds.push(services.get(step.service));
  }
  call("set_runner", "default");
  identity(call("pipeline", value.name), "pipeline");
  [...new Set(serviceIds)].forEach(id => call("with_service", id));
  for (const step of value.steps) {
    switch (step.kind) {
      case "exec": call("with_exec", JSON.stringify(step.args.map(quote))); break;
      case "shell": call("with_exec", JSON.stringify([step.command])); break;
      case "workdir": call("with_workdir", step.path); break;
      case "env": call("set_envs", JSON.stringify([[step.key, step.data]])); break;
      case "cache": {
        const id = caches.get(step.key);
        call("with_cache", JSON.stringify({ id, key: step.key, path: step.path }));
        break;
      }
      case "provider":
        call("set_runner", step.name);
        if (step.name !== "default") identity(call(step.name, step.name === "nix" ? JSON.stringify({ impure: step.impure }) : ""), step.name);
        break;
      case "packages": call("with_packages", JSON.stringify(step.packages.map(quote))); break;
      case "wait": call("wait_on", JSON.stringify([step.port, step.timeout])); break;
      case "secret": {
        if (!secrets.has(step.source)) {
          const id = step.source.kind === "value" ? call("set_secret", JSON.stringify([step.source.name, step.source.data])) : step.source.id;
          text(id, "set_secret");
          secrets.set(step.source, id);
        }
        call("with_secret_variable", JSON.stringify([step.key, secrets.get(step.source)]));
        break;
      }
    }
  }
}
export const runImpl = invoke => makeError => left => right => useStderr => value => () =>
  result(makeError, left, right, useStderr ? "stderr" : "stdout", () => {
    validatePipeline(value); // Validate the entire tree before the first host effect.
    const call = caller(invoke);
    const caches = new Map();
    prepareCaches(value, call, caches);
    emit(value, call, new Map(), new Map(), caches);
    return call(useStderr ? "stderr" : "stdout");
  });

export const effectImpl = invoke => makeError => left => right => operation => args => () =>
  result(makeError, left, right, operation, () => {
    const call = caller(invoke);
    switch (operation) {
      case "sha256": case "md5":
        text(args[0], operation);
        identity(call("file", args[0]), "file");
        return call(operation, args[0]);
      case "call":
        text(args[0], "call"); text(args[1], "call"); text(args[2], "call", true);
        return call("call", JSON.stringify({ url: args[0], function: args[1], args: args[2] }));
      case "get_env": case "has_env": {
        environmentKey(args[0], operation);
        const value = call(operation, args[0]);
        if (operation === "has_env" && typeof jsonResponse(value, operation) !== "boolean")
          throw failure("invalid-response", operation, "Expected a boolean");
        return value;
      }
      case "get_os": case "get_arch": return call(operation);
      case "secretmanager": {
        const [provider, value] = args;
        text(value, operation);
        const choices = {
          aws: { Aws: { aws_region: value } }, google: { Google: { google_project: value } },
          azure: { Azure: { credential: {}, azure_keyvault_url: value } }, hashicorp: { Hashicorp: { vault_address: value } },
        };
        if (!Object.prototype.hasOwnProperty.call(choices, provider)) invalid(operation, "Unknown secret provider");
        const id = call("add_secretmanager", JSON.stringify(choices[provider]));
        text(id, "add_secretmanager");
        return id;
      }
      case "input":
        if (typeof Host === "undefined" || typeof Host.inputString !== "function")
          throw failure("missing-host", "input", "Extism guest input is unavailable");
        return Host.inputString();
      case "output":
        text(args[0], operation, true);
        if (typeof Host === "undefined" || typeof Host.outputString !== "function")
          throw failure("missing-host", "output", "Extism guest output is unavailable");
        Host.outputString(args[0]);
        return "";
      default: invalid(operation, "Unknown effect");
    }
  });
export const getSecretsImpl = invoke => makeError => left => right => manager => name => () =>
  result(makeError, left, right, "get_secret", () => {
    text(manager, "get_secret"); text(name, "get_secret");
    const values = jsonResponse(caller(invoke)("get_secret", JSON.stringify([manager, name])), "get_secret");
    if (!Array.isArray(values) || values.some(value => !value || typeof value.id !== "string" || !value.id || typeof value.name !== "string" || typeof value.mount !== "string"))
      throw failure("invalid-response", "get_secret", "Expected secret handles");
    return values.map(value => frozen({ kind: "reference", id: value.id, name: value.name, mount: value.mount }));
  });
