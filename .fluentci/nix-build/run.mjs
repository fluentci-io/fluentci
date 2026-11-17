import { spawn } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function configuration(env) {
  const base = env.FLUENTCI_CACHE_URL?.trim();
  const publicKey = env.FLUENTCI_NIX_PUBLIC_KEY?.trim();
  const token = env.FLUENTCI_CACHE_TOKEN?.trim();
  const signingKey = env.FLUENTCI_NIX_SIGNING_KEY?.trim();
  if (Boolean(base) !== Boolean(publicKey))
    throw Error("Set both FLUENTCI_CACHE_URL and FLUENTCI_NIX_PUBLIC_KEY");
  if (Boolean(token) !== Boolean(signingKey))
    throw Error(
      "Signed uploads require both FLUENTCI_CACHE_TOKEN and FLUENTCI_NIX_SIGNING_KEY",
    );
  if (token && !base)
    throw Error("Upload credentials require cache URL and public key");
  let cache;
  if (base) {
    const url = new URL(base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/accounts\/[a-f0-9]{64}\/?$/.test(url.pathname)
    )
      throw Error(
        "FLUENTCI_CACHE_URL must be an HTTPS account URL without /nix",
      );
    if (!/^[\w.-]+:[A-Za-z0-9+/]{43}=$/.test(publicKey))
      throw Error(
        "FLUENTCI_NIX_PUBLIC_KEY must contain the full Nix public key",
      );
    cache = base.replace(/\/$/, "") + "/nix";
  }
  if (signingKey) {
    const match = /^([\w.-]+):([A-Za-z0-9+/]{86}==)$/.exec(signingKey);
    if (!match)
      throw Error(
        "FLUENTCI_NIX_SIGNING_KEY must contain a Nix private key, not a path",
      );
    const bytes = Buffer.from(match[2], "base64");
    const key = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        bytes.subarray(0, 32),
      ]),
      format: "der",
      type: "pkcs8",
    });
    const derived = createPublicKey(key)
      .export({ format: "der", type: "spki" })
      .subarray(-32);
    if (
      `${match[1]}:${derived.toString("base64")}` !== publicKey ||
      !derived.equals(bytes.subarray(32))
    )
      throw Error("Nix signing key does not match FLUENTCI_NIX_PUBLIC_KEY");
    if (/[\r\n]/.test(token)) throw Error("Invalid upload token");
  }
  const nixEnv = { ...env };
  if (cache)
    nixEnv.NIX_CONFIG = [
      env.NIX_CONFIG || "",
      `extra-substituters = ${cache}`,
      `extra-trusted-public-keys = ${publicKey}`,
    ].join("\n");
  // The build and its subprocesses do not need upload credentials.
  delete nixEnv.FLUENTCI_CACHE_TOKEN;
  delete nixEnv.FLUENTCI_NIX_SIGNING_KEY;
  return { cache, publicKey, token, signingKey, nixEnv };
}

export function command(program, args, env, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      env,
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

const lines = (text) => text.trim().split(/\s+/).filter(Boolean);
const batches = (values, size = 100) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );

export async function uploadFiles(directory, cache, token, fetcher = fetch) {
  // Publish payloads completely before making any narinfo visible to readers.
  const nars = (await readdir(join(directory, "nar"))).map(
    (file) => `nar/${file}`,
  );
  const infos = (await readdir(directory)).filter((file) =>
    file.endsWith(".narinfo"),
  );
  for (const files of [nars, infos]) {
    for (const group of batches(files, 4)) {
      const results = await Promise.allSettled(
        group.map(async (file) => {
          const path = join(directory, file);
          const response = await fetcher(`${cache}/${file}`, {
            method: "PUT",
            redirect: "error",
            signal: AbortSignal.timeout(600_000),
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Length": String((await stat(path)).size),
            },
            body: createReadStream(path),
            duplex: "half",
          });
          await response.body?.cancel();
          if (!response.ok)
            throw Error(
              `Cache upload failed for ${file}: HTTP ${response.status}`,
            );
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    }
  }
}

export async function build(
  env = process.env,
  run = command,
  upload = uploadFiles,
) {
  const config = configuration(env);
  console.log(
    config.cache
      ? `Nix cache: ${config.cache}`
      : "No FluentCI cache configured; using default Nix substituters",
  );
  const built = JSON.parse(
    await run(
      "nix",
      ["build", "--no-write-lock-file", "--json", ".#fluentci"],
      config.nixEnv,
      true,
    ),
  );
  if (!config.token) {
    console.log("No upload credentials; cache is read-only");
    return;
  }
  const roots = built
    .flatMap((result) => [result.drvPath, ...Object.values(result.outputs)])
    .filter(Boolean);
  const closure = lines(
    await run(
      "nix-store",
      ["--query", "--requisites", "--include-outputs", ...roots],
      config.nixEnv,
      true,
    ),
  ).filter((path) => !path.endsWith(".drv"));
  // Include intermediate outputs (notably Crane's Cargo artifacts). Existing
  // signed substitutes stay available from their original trusted caches.
  const paths = [];
  for (const batch of batches([...new Set(closure)])) {
    const metadata = JSON.parse(
      await run("nix", ["path-info", "--json", ...batch], config.nixEnv, true),
    );
    const entries = Array.isArray(metadata)
      ? metadata
      : Object.entries(metadata).map(([path, info]) => ({ path, ...info }));
    for (const info of entries)
      if (!info.signatures?.length) paths.push(info.path);
  }
  if (!paths.length) return;
  const directory = await mkdtemp(
    join(env.RUNNER_TEMP || tmpdir(), "fluentci-nix-"),
  );
  try {
    const keyPath = join(directory, "signing.key");
    const exportDir = join(directory, "cache");
    await writeFile(keyPath, config.signingKey + "\n", { mode: 0o600 });
    await mkdir(exportDir);
    const destination = pathToFileURL(exportDir);
    destination.searchParams.set("secret-key", keyPath);
    for (const batch of batches(paths))
      await run(
        "nix",
        ["copy", "--no-recursive", "--to", destination.href, ...batch],
        config.nixEnv,
      );
    await upload(exportDir, config.cache, config.token);
    console.log(`Published ${paths.length} store paths to FluentCI cache`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  build().catch((error) => {
    // Do not print fetch causes or request options containing credentials.
    console.error(error.message);
    process.exitCode = 1;
  });
}
