import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, readFileSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const repository = "https://github.com/fluentci-io/fluentci";
const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export function targetFor(platform, architecture) {
  const os = {
    darwin: "apple-darwin",
    linux: "unknown-linux-gnu",
    freebsd: "unknown-freebsd",
    netbsd: "unknown-netbsd",
    openbsd: "unknown-openbsd",
  }[platform];
  const arch = { x64: "x86_64", arm64: "aarch64" }[architecture];
  if (!os || !arch || (!["darwin", "linux"].includes(platform) && arch !== "x86_64")) {
    throw new Error(`No FluentCI release binary is available for ${platform}/${architecture}.`);
  }
  return `${arch}-${os}`;
}

export function releaseTag(version) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(version)) {
    throw new Error("FLUENTCI_VERSION must be a release tag or latest.");
  }
  return /^\d+\.\d+\.\d+/.test(version) ? `v${version}` : version;
}

export function defaultCacheRoot() {
  if (process.env.FLUENTCI_CACHE_DIR) return resolve(process.env.FLUENTCI_CACHE_DIR);
  const base = process.env.XDG_CACHE_HOME || (
    process.platform === "darwin" ? join(homedir(), "Library", "Caches") : join(homedir(), ".cache")
  );
  return join(base, "fluentci", "npm");
}

async function request(fetchImpl, url, method = "GET") {
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(300_000),
        headers: { "User-Agent": `fluentci-npm/${packageVersion}`, "Accept-Encoding": "identity" },
      });
    } catch (error) {
      if (attempt >= 2) throw new Error(`Could not download ${url}: ${error.message}`, { cause: error });
    }
    if (response?.ok) return response;
    const status = response?.status;
    await response?.body?.cancel();
    if (response && (attempt >= 2 || !(status === 408 || status === 429 || status >= 500))) {
      throw new Error(`Could not download ${url}: HTTP ${status}. Check that the release contains this platform's binary.`);
    }
    await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt));
  }
}

async function smallText(response) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 8192) throw new Error("Release checksum exceeds the expected size.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function extractArchive(archive, directory) {
  // Extract only the expected executable, never arbitrary archive paths.
  await new Promise((done, reject) => {
    const child = spawn("tar", ["-xzf", archive, "-C", directory, "fluentci"], { stdio: ["ignore", "ignore", "pipe"] });
    let diagnostic = "";
    child.stderr.on("data", (chunk) => { diagnostic = (diagnostic + chunk).slice(-4096); });
    child.on("error", (error) => reject(new Error(`Could not extract FluentCI; tar must be installed: ${error.message}`)));
    child.on("close", (code, signal) => {
      if (code === 0) done();
      else reject(new Error(`Could not extract FluentCI (${signal || code}): ${diagnostic.trim()}`));
    });
  });
}

async function isExecutable(path) {
  try {
    const stat = await lstat(path);
    return stat.isFile() && stat.size > 0 && (stat.mode & 0o111) !== 0;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function ensureBinary({
  version = process.env.FLUENTCI_VERSION || packageVersion,
  platform = process.platform,
  architecture = process.arch,
  cacheRoot = defaultCacheRoot(),
  fetchImpl = globalThis.fetch,
  extract = extractArchive,
  log = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  const target = targetFor(platform, architecture);
  let tag = releaseTag(version);
  if (tag === "latest") {
    const response = await request(fetchImpl, `${repository}/releases/latest`, "HEAD");
    const prefix = `${repository}/releases/tag/`;
    if (!response.url.startsWith(prefix)) throw new Error("Could not resolve the latest FluentCI release.");
    tag = releaseTag(response.url.slice(prefix.length));
    if (tag === "latest") throw new Error("Could not resolve the latest FluentCI release.");
  }
  const directory = join(cacheRoot, tag, target);
  const executable = join(directory, "fluentci");
  if (await isExecutable(executable)) return executable;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Unique staging plus atomic rename makes concurrent npx invocations safe.
  // No persistent lock/guard file is needed, including after interrupted installs.
  const staging = await mkdtemp(join(directory, ".download-"));
  try {
    const asset = `fluentci_${tag}_${target}.tar.gz`;
    const url = `${repository}/releases/download/${tag}/${asset}`;
    log(`Downloading FluentCI ${tag} for ${target}...`);
    const checksum = await smallText(await request(fetchImpl, `${url}.sha256`));
    const expected = checksum.match(/^([a-f0-9]{64})(?:\s|$)/i)?.[1].toLowerCase();
    if (!expected) throw new Error(`Invalid SHA-256 checksum for ${asset}.`);
    const response = await request(fetchImpl, url);
    if (!response.body) throw new Error(`Empty download for ${asset}.`);
    const hash = createHash("sha256");
    let size = 0;
    const archive = join(staging, "release.tar.gz");
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, done) {
          size += chunk.length;
          if (size > 512 * 1024 * 1024) return done(new Error("FluentCI release archive exceeds 512 MiB."));
          hash.update(chunk);
          done(null, chunk);
        },
      }),
      createWriteStream(archive, { flags: "wx", mode: 0o600 }),
    );
    if (hash.digest("hex") !== expected) throw new Error(`SHA-256 checksum mismatch for ${asset}.`);
    await extract(archive, staging);
    const extracted = join(staging, "fluentci");
    const stat = await lstat(extracted);
    if (!stat.isFile() || stat.size === 0) throw new Error("Release must contain a regular, nonempty fluentci executable.");
    await chmod(extracted, 0o755);
    await rename(extracted, executable);
    return executable;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
