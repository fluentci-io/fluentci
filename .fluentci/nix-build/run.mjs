import { spawn } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readdir,
  rm,
  stat,
  readFile,
} from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
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
      "http-connections = 16",
      `extra-substituters = ${cache}`,
      `extra-trusted-public-keys = ${publicKey}`,
    ].join("\n");
  // The build and its subprocesses do not need upload credentials.
  delete nixEnv.FLUENTCI_CACHE_TOKEN;
  delete nixEnv.FLUENTCI_NIX_SIGNING_KEY;
  return { cache, publicKey, token, signingKey, nixEnv };
}

export function command(program, args, env, capture = false, signal) {
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

export async function requireSignatures(directory, publicKey) {
  const keyName = publicKey.split(":")[0];
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith(".narinfo"),
  );
  if (!files.length) throw Error("Nix export contains no signed metadata");
  for (const file of files) {
    const text = await readFile(join(directory, file), "utf8");
    const signed = text.split("\n").some((line) => {
      const prefix = `Sig: ${keyName}:`;
      if (!line.startsWith(prefix)) return false;
      const signature = line.slice(prefix.length).trim();
      return /^[A-Za-z0-9+/]{86}==$/.test(signature);
    });
    if (!signed) throw Error(`Refusing unsigned Nix metadata: ${file}`);
  }
}

export async function build(
  env = process.env,
  run = command,
  upload = uploadFiles,
  { pollIntervalMs = 2000 } = {},
) {
  const config = configuration(env);
  console.log(
    config.cache
      ? `Nix cache: ${config.cache}`
      : "No FluentCI cache configured; using default Nix substituters",
  );
  const buildArgs = ["build", "--no-write-lock-file", "--json", ".#fluentci"];
  if (!config.token) {
    await run("nix", buildArgs, config.nixEnv, true);
    console.log("No upload credentials; cache is read-only");
    return;
  }
  const directory = await mkdtemp(
    join(env.RUNNER_TEMP || tmpdir(), "fluentci-nix-"),
  );
  const controller = new AbortController();
  let building;
  try {
    const keyPath = join(directory, "signing.key");
    await writeFile(keyPath, config.signingKey + "\n", { mode: 0o600 });
    const published = new Set();
    const allPaths = async () =>
      lines(await run("nix", ["path-info", "--all"], config.nixEnv, true));
    const seen = new Set(await allPaths());
    const publish = async (candidates) => {
      const unique = [...new Set(candidates)].filter(
        (path) => !path.endsWith(".drv") && !published.has(path),
      );
      for (const batch of batches(unique)) {
        const metadata = JSON.parse(
          await run(
            "nix",
            ["path-info", "--json", ...batch],
            config.nixEnv,
            true,
          ),
        );
        const entries = Array.isArray(metadata)
          ? metadata
          : Object.entries(metadata).map(([path, info]) => ({ path, ...info }));
        const paths = entries
          .filter((info) => !info.signatures?.length)
          .map((info) => info.path);
        if (!paths.length) continue;
        const exportDir = join(directory, "cache");
        await mkdir(exportDir);
        try {
          const destination = pathToFileURL(exportDir);
          destination.searchParams.set("secret-key", keyPath);
          await run(
            "nix",
            ["copy", "--no-recursive", "--to", destination.href, ...paths],
            config.nixEnv,
          );
          await requireSignatures(exportDir, config.publicKey);
          // Ask Nix to verify exported signatures using our key, without rereading
          // or decompressing the NAR payloads. No unsigned metadata is published.
          await run(
            "nix",
            [
              "store",
              "verify",
              "--store",
              pathToFileURL(exportDir).href,
              "--no-contents",
              "--sigs-needed",
              "1",
              "--trusted-public-keys",
              config.publicKey,
              ...paths,
            ],
            config.nixEnv,
          );
          await upload(exportDir, config.cache, config.token);
          paths.forEach((path) => published.add(path));
          console.log(
            `Published ${paths.length} signed store paths (${published.size} total)`,
          );
        } finally {
          await rm(exportDir, { recursive: true, force: true });
        }
      }
    };
    const scan = async () => {
      const current = await allPaths();
      const fresh = current.filter((path) => !seen.has(path));
      current.forEach((path) => seen.add(path));
      await publish(fresh);
    };
    let done = false;
    // Capture rejection immediately; watcher failures cancel the build client,
    // while build failures still drain completed artifacts into the cache.
    building = Promise.resolve()
      .then(() => run("nix", buildArgs, config.nixEnv, true, controller.signal))
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      )
      .finally(() => {
        done = true;
      });
    console.log(
      "Watching Nix store; publishing newly built paths during the build",
    );
    while (!done) {
      await scan();
      if (!done) {
        const pause = new AbortController();
        try {
          await Promise.race([
            building,
            delay(pollIntervalMs, undefined, { signal: pause.signal }),
          ]);
        } finally {
          pause.abort();
        }
      }
    }
    const outcome = await building;
    await scan();
    if (outcome.error) throw outcome.error;
    const built = JSON.parse(outcome.value);
    const roots = built
      .flatMap((result) => [result.drvPath, ...Object.values(result.outputs)])
      .filter(Boolean);
    if (roots.length) {
      const closure = lines(
        await run(
          "nix-store",
          ["--query", "--requisites", "--include-outputs", ...roots],
          config.nixEnv,
          true,
        ),
      );
      await publish(closure);
    }
    console.log(`Nix cache uploads complete: ${published.size} signed paths`);
  } catch (error) {
    controller.abort();
    if (building) await building;
    throw error;
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
