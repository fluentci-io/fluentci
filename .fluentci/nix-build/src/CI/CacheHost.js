import { spawn } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

// Platform primitives only. Selection, ordering, retries and publishing policy
// live in CacheHost.purs. Callback hooks let tests exercise the same program.
export const envValue = (env) => (key) => (env[key] || "").trim();
export const envForNix = (env) => (nixConfig) => {
  const copy = { ...env };
  if (nixConfig) copy.NIX_CONFIG = nixConfig;
  delete copy.FLUENTCI_CACHE_TOKEN;
  delete copy.FLUENTCI_NIX_SIGNING_KEY;
  return copy;
};
export const matches = (pattern) => (text) => new RegExp(pattern).test(text);
export const urlParts = (text) => () => {
  const url = new URL(text);
  return Object.fromEntries(
    ["protocol", "username", "password", "pathname", "search", "hash"].map(
      (key) => [key, url[key]],
    ),
  );
};
export const decodePart = (value) => () => decodeURIComponent(value);
export const deriveKey = (secret) => () => {
  const bytes = Buffer.from(secret, "base64");
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      bytes.subarray(0, 32),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(key)
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  return {
    publicKey: publicKey.toString("base64"),
    embeddedMatches: publicKey.equals(bytes.subarray(32)),
  };
};
export const log = (text) => () => console.log(text);
export const clock = () => Date.now();
export const temporaryRoot = tmpdir();
export const pathJoin = (parts) => join(...parts);
export const fileUrl = (path) => (params) => {
  const url = pathToFileURL(path);
  params.forEach(({ key, value }) => url.searchParams.set(key, value));
  return url.href;
};
export const tempDir = (base) => () => fs.mkdtemp(join(base, "fluentci-nix-"));
export const makeDir = (path) => () =>
  fs.mkdir(path, { recursive: true }).then(() => {});
export const removeDir = (path) => () =>
  fs.rm(path, { recursive: true, force: true });
export const writeText = (path) => (text) => (privateFile) => () =>
  fs.writeFile(path, text, { mode: privateFile ? 0o600 : 0o644 });
export const readText = (path) => () => fs.readFile(path, "utf8");
export const listDir = (path) => () => fs.readdir(path);
export const fileSize = (path) => () => fs.stat(path).then((stat) => stat.size);
export const controller = () => new AbortController();
export const noController = undefined;
export const abort = (value) => () => value.abort();
export const errorName = (error) => error.name || "Error";
export const errorCode = (error) => error.code || "";
export const wait = (hooks) => (ms) => () => (hooks.wait || setTimeout)(ms);

export function commandRaw(program, args, env, capture = false, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      env,
      signal,
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(Error(`${program} failed (${code})`)),
    );
  });
}
export const run =
  (hooks) => (program) => (args) => (env) => (capture) => (control) => () =>
    (hooks.run || commandRaw)(program, args, env, capture, control?.signal);
export const hasLookup = (hooks) => typeof hooks.lookup === "function";
export const invokeLookup =
  (hooks) => (directory) => (paths) => (cache) => () =>
    hooks.lookup(directory, paths, cache);
export const invokeUpload =
  (hooks) => (directory) => (cache) => (token) => (files) => () =>
    hooks.upload(directory, cache, token, undefined, files);
export const fetchGet = (hooks) => (url) => (timeout) => () =>
  (hooks.fetcher || fetch)(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
export const responseStatus = (response) => response.status;
export const responseHeader = (response) => (key) =>
  response.headers?.get(key) || "";
export const responseText = (response) => (limit) => () =>
  (async () => {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw Error("Cache metadata exceeds size limit");
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks).toString("utf8");
    } finally {
      await reader.cancel();
    }
  })();
export const cancelBody = (response) => () =>
  response.body?.cancel() || Promise.resolve();
export const putStream =
  (hooks) => (path) => (url) => (token) => (timeout) => () =>
    (async () => {
      const body = createReadStream(path);
      try {
        const response = await (hooks.fetcher || fetch)(url, {
          method: "PUT",
          redirect: "error",
          signal: AbortSignal.timeout(timeout),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Length": String((await fs.stat(path)).size),
          },
          body,
          duplex: "half",
        });
        await response.body?.cancel();
        return {
          status: response.status,
          retryAfter: response.headers?.get("retry-after") || "",
        };
      } finally {
        body.destroy();
      }
    })();
export const headerDelay = (value) => (now) => {
  const seconds = Number(value);
  return value
    ? Number.isFinite(seconds)
      ? seconds * 1000
      : Math.max(0, Date.parse(value) - now) || 0
    : 0;
};
export const pathInfos = (text) => () => {
  const data = JSON.parse(text);
  return (
    Array.isArray(data)
      ? data
      : Object.entries(data).map(([path, info]) => ({ path, ...info }))
  ).map((info) => ({ path: info.path, signatures: info.signatures || [] }));
};
export const buildRoots = (text) => () =>
  JSON.parse(text)
    .flatMap((info) => [info.drvPath, ...Object.values(info.outputs)])
    .filter(Boolean);
