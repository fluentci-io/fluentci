// Generated from schema/host.json. No host runtime is instantiated.
const signatures = Object.freeze({
  "add_secretmanager": {
    "input": true,
    "output": true,
    "json": true
  },
  "as_service": {
    "input": true,
    "output": true,
    "json": false
  },
  "branch": {
    "input": true,
    "output": false,
    "json": false
  },
  "cache": {
    "input": true,
    "output": true,
    "json": false
  },
  "call": {
    "input": true,
    "output": true,
    "json": true
  },
  "chmod": {
    "input": true,
    "output": true,
    "json": true
  },
  "commit": {
    "input": false,
    "output": true,
    "json": false
  },
  "devbox": {
    "input": false,
    "output": true,
    "json": false
  },
  "devenv": {
    "input": false,
    "output": true,
    "json": false
  },
  "directory": {
    "input": true,
    "output": true,
    "json": false
  },
  "entries": {
    "input": true,
    "output": true,
    "json": false
  },
  "envhub": {
    "input": false,
    "output": true,
    "json": false
  },
  "execute_plan": {
    "input": true,
    "output": true,
    "json": false
  },
  "file": {
    "input": true,
    "output": true,
    "json": false
  },
  "flox": {
    "input": false,
    "output": true,
    "json": false
  },
  "get_arch": {
    "input": false,
    "output": true,
    "json": false
  },
  "get_env": {
    "input": true,
    "output": true,
    "json": false
  },
  "get_os": {
    "input": false,
    "output": true,
    "json": false
  },
  "get_secret": {
    "input": true,
    "output": true,
    "json": true
  },
  "get_secret_plaintext": {
    "input": true,
    "output": true,
    "json": true
  },
  "git": {
    "input": true,
    "output": true,
    "json": false
  },
  "has_env": {
    "input": true,
    "output": true,
    "json": false
  },
  "hermit": {
    "input": false,
    "output": true,
    "json": false
  },
  "http": {
    "input": true,
    "output": true,
    "json": false
  },
  "install": {
    "input": false,
    "output": false,
    "json": false
  },
  "md5": {
    "input": true,
    "output": true,
    "json": false
  },
  "mise": {
    "input": false,
    "output": true,
    "json": false
  },
  "nix": {
    "input": true,
    "output": true,
    "json": true
  },
  "pipeline": {
    "input": true,
    "output": true,
    "json": false
  },
  "pixi": {
    "input": false,
    "output": true,
    "json": false
  },
  "pkgx": {
    "input": false,
    "output": true,
    "json": false
  },
  "proto": {
    "input": false,
    "output": true,
    "json": false
  },
  "remove_env": {
    "input": true,
    "output": false,
    "json": false
  },
  "set_envs": {
    "input": true,
    "output": false,
    "json": false
  },
  "set_runner": {
    "input": true,
    "output": false,
    "json": false
  },
  "set_secret": {
    "input": true,
    "output": true,
    "json": true
  },
  "sha256": {
    "input": true,
    "output": true,
    "json": false
  },
  "stderr": {
    "input": false,
    "output": true,
    "json": false
  },
  "stdout": {
    "input": false,
    "output": true,
    "json": false
  },
  "tar_czvf": {
    "input": true,
    "output": true,
    "json": false
  },
  "tar_xzvf": {
    "input": true,
    "output": true,
    "json": false
  },
  "tree": {
    "input": false,
    "output": true,
    "json": false
  },
  "trust": {
    "input": false,
    "output": false,
    "json": false
  },
  "unzip": {
    "input": true,
    "output": true,
    "json": false
  },
  "wait_on": {
    "input": true,
    "output": false,
    "json": true
  },
  "with_cache": {
    "input": true,
    "output": false,
    "json": true
  },
  "with_exec": {
    "input": true,
    "output": false,
    "json": true
  },
  "with_file": {
    "input": true,
    "output": false,
    "json": true
  },
  "with_packages": {
    "input": true,
    "output": false,
    "json": true
  },
  "with_secret_variable": {
    "input": true,
    "output": false,
    "json": true
  },
  "with_service": {
    "input": true,
    "output": false,
    "json": false
  },
  "with_workdir": {
    "input": true,
    "output": false,
    "json": false
  },
  "zip": {
    "input": true,
    "output": true,
    "json": false
  }
});
export const signatureJson = JSON.stringify(signatures);

const failure = (kind, operation, message) => Object.assign(new Error(message), { kind, operation });
function invokeRaw(name, input) {
  const signature = signatures[name];
  if (!signature) throw failure("missing-host", name, "Unknown FluentCI host function");
  if (typeof Host === "undefined" || typeof Host.getFunctions !== "function")
    throw failure("missing-host", name, "Run this code inside a FluentCI Wasm plugin");
  const functions = Host.getFunctions();
  if (typeof functions[name] !== "function")
    throw failure("missing-host", name, "The engine does not expose this function");
  if (signature.json) {
    try { JSON.parse(input); }
    catch (_) { throw failure("invalid-input", name, "Expected a JSON wire payload"); }
  }
  try {
    const result = signature.input ? functions[name](Memory.fromString(input).offset) : functions[name]();
    if (!signature.output) return "";
    // Extism returns offset 0 for an empty block (e.g. an unset environment variable).
    const block = result ? Memory.find(result) : undefined;
    return block ? block.readString() : "";
  } catch (error) {
    throw failure("host-failure", name, error instanceof Error ? error.message : String(error));
  }
}
export const invoke = name => input => () => invokeRaw(name, input);

export const add_secretmanager = value => () => invokeRaw("add_secretmanager", value);
export const as_service = value => () => invokeRaw("as_service", value);
export const branch = value => () => { invokeRaw("branch", value); };
export const cache = value => () => invokeRaw("cache", value);
export const call = value => () => invokeRaw("call", value);
export const chmod = value => () => invokeRaw("chmod", value);
export const commit = () => invokeRaw("commit", "");
export const devbox = () => invokeRaw("devbox", "");
export const devenv = () => invokeRaw("devenv", "");
export const directory = value => () => invokeRaw("directory", value);
export const entries = value => () => invokeRaw("entries", value);
export const envhub = () => invokeRaw("envhub", "");
export const execute_plan = value => () => invokeRaw("execute_plan", value);
export const file = value => () => invokeRaw("file", value);
export const flox = () => invokeRaw("flox", "");
export const get_arch = () => invokeRaw("get_arch", "");
export const get_env = value => () => invokeRaw("get_env", value);
export const get_os = () => invokeRaw("get_os", "");
export const get_secret = value => () => invokeRaw("get_secret", value);
export const get_secret_plaintext = value => () => invokeRaw("get_secret_plaintext", value);
export const git = value => () => invokeRaw("git", value);
export const has_env = value => () => invokeRaw("has_env", value);
export const hermit = () => invokeRaw("hermit", "");
export const http = value => () => invokeRaw("http", value);
export const install = () => { invokeRaw("install", ""); };
export const md5 = value => () => invokeRaw("md5", value);
export const mise = () => invokeRaw("mise", "");
export const nix = value => () => invokeRaw("nix", value);
export const pipeline = value => () => invokeRaw("pipeline", value);
export const pixi = () => invokeRaw("pixi", "");
export const pkgx = () => invokeRaw("pkgx", "");
export const proto = () => invokeRaw("proto", "");
export const remove_env = value => () => { invokeRaw("remove_env", value); };
export const set_envs = value => () => { invokeRaw("set_envs", value); };
export const set_runner = value => () => { invokeRaw("set_runner", value); };
export const set_secret = value => () => invokeRaw("set_secret", value);
export const sha256 = value => () => invokeRaw("sha256", value);
export const stderr = () => invokeRaw("stderr", "");
export const stdout = () => invokeRaw("stdout", "");
export const tar_czvf = value => () => invokeRaw("tar_czvf", value);
export const tar_xzvf = value => () => invokeRaw("tar_xzvf", value);
export const tree = () => invokeRaw("tree", "");
export const trust = () => { invokeRaw("trust", ""); };
export const unzip = value => () => invokeRaw("unzip", value);
export const wait_on = value => () => { invokeRaw("wait_on", value); };
export const with_cache = value => () => { invokeRaw("with_cache", value); };
export const with_exec = value => () => { invokeRaw("with_exec", value); };
export const with_file = value => () => { invokeRaw("with_file", value); };
export const with_packages = value => () => { invokeRaw("with_packages", value); };
export const with_secret_variable = value => () => { invokeRaw("with_secret_variable", value); };
export const with_service = value => () => { invokeRaw("with_service", value); };
export const with_workdir = value => () => { invokeRaw("with_workdir", value); };
export const zip = value => () => invokeRaw("zip", value);
