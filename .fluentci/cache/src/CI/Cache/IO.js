// Host primitives only; connection policy, protocol configuration and retries are PureScript.
import { createReadStream, createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import {
  dirname,
  join,
  resolve,
  isAbsolute,
  parse,
  relative,
  sep,
} from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, PassThrough } from "node:stream";
import {
  createGzip,
  createGunzip,
  createZstdCompress,
  createZstdDecompress,
  constants,
} from "node:zlib";
import * as tar from "tar";

const MAGIC = "FLUENTCI-CACHE/1 ";
const MAX_BYTES = 20 * 1024 ** 3;
export const parseUrl = (value) => () => {
  const u = new URL(value);
  return {
    base: u.href.replace(/\/$/, ""),
    protocol: u.protocol,
    host: u.host,
    origin: u.origin,
    pathname: u.pathname.replace(/\/$/, ""),
    username: u.username,
    password: u.password ?? "",
    search: u.search,
    hash: u.hash,
  };
};
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const encode = (value) => encodeURIComponent(value);
export const cacheOwner = (text) => () => JSON.parse(text).owner ?? "";
export const setValue = (env) => (key) => (value) => ({ ...env, [key]: value });
export const toJson = (value) => JSON.stringify(value);
export const pathAbsolute = (value) => () => resolve(value);
export const remove = (path) => () =>
  fs.rm(path, { recursive: true, force: true });
const codec = (format, unpack = false) =>
  format === "zstd"
    ? unpack
      ? createZstdDecompress()
      : createZstdCompress({
          params: { [constants.ZSTD_c_compressionLevel]: 3 },
        })
    : format === "gzip"
      ? unpack
        ? createGunzip()
        : createGzip({ level: 6 })
      : new PassThrough();
const meter = (hash, maximum = MAX_BYTES) => {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, done) {
      total += chunk.length;
      if (total > maximum)
        return done(Error("Cache exceeds the 20 GiB expanded-size limit"));
      hash?.update(chunk);
      done(null, chunk);
    },
  });
};
async function regularTree(path, root = resolve(path)) {
  const stat = await fs.lstat(path);
  if (stat.isSymbolicLink()) {
    const link = await fs.readlink(path);
    if (
      isAbsolute(link) ||
      /^[A-Za-z]:/.test(link) ||
      link.includes("\\") ||
      link.split("/").includes("..") ||
      !resolve(dirname(path), link).startsWith(root + "/")
    )
      throw Error("Unsafe cache symbolic link");
    return;
  }
  if (!(stat.isFile() || stat.isDirectory()))
    throw Error("Cache paths must contain regular files and directories only");
  if (stat.isDirectory())
    for (const name of await fs.readdir(path))
      await regularTree(join(path, name), root);
}
export const pack = (path) => (format) => () =>
  (async () => {
    const source = resolve(path);
    await regularTree(source);
    const directory = await fs.mkdtemp(join(tmpdir(), "fluentci-cache-save-"));
    try {
      const kind = (await fs.lstat(source)).isDirectory()
        ? "directory"
        : "file";
      const hash = createHash("sha256");
      const payload = join(directory, "payload");
      const input =
        kind === "directory"
          ? tar.c({ cwd: source, portable: true, follow: false }, ["."])
          : createReadStream(source);
      await pipeline(
        input,
        codec(format),
        meter(hash),
        createWriteStream(payload, { mode: 0o600 }),
      );
      const header =
        MAGIC +
        JSON.stringify({
          kind,
          compression: format,
          sha256: hash.digest("hex"),
          mode: (await fs.lstat(source)).mode & 0o777,
        }) +
        "\n";
      const file = join(directory, "upload");
      await fs.writeFile(file, header, { mode: 0o600 });
      await pipeline(
        createReadStream(payload),
        createWriteStream(file, { flags: "a" }),
      );
      await fs.unlink(payload);
      return { directory, file, bytes: String((await fs.stat(file)).size) };
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  })();
export const download = (url) => (token) => () =>
  (async () => {
    const signal = AbortSignal.timeout(125 * 60 * 1000);
    let current = new URL(url);
    let headers = { Authorization: `Bearer ${token}` };
    let response;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(current.href, {
        headers,
        redirect: "manual",
        signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects >= 5)
        throw Error("Invalid cache download redirect or too many redirects");
      const next = new URL(location, current);
      if (next.protocol !== "https:" || next.username || next.password)
        throw Error(
          "Cache download redirects must use HTTPS without credentials",
        );
      // Public CDN reads must never receive the account's upload token.
      if (next.origin !== current.origin) headers = {};
      current = next;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, directory: "", file: "" };
    }
    const directory = await fs.mkdtemp(
      join(tmpdir(), "fluentci-cache-download-"),
    );
    const file = join(directory, "download");
    try {
      await pipeline(
        response.body,
        meter(),
        createWriteStream(file, { mode: 0o600 }),
      );
      return { status: response.status, directory, file };
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  })();
async function parentsSafe(target) {
  for (let part = dirname(target); ;) {
    try {
      if ((await fs.lstat(part)).isSymbolicLink())
        throw Error("Restore destination parents cannot be symlinks");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(part);
    if (parent === part) break;
    part = parent;
  }
}
export const unpack = (file) => (destination) => () =>
  (async () => {
    const target = resolve(destination);
    const inside = relative(target, process.cwd());
    if (
      target === parse(target).root ||
      inside === "" ||
      (inside !== ".." && !inside.startsWith(".." + sep) && !isAbsolute(inside))
    )
      throw Error(
        "Restore into a cache file or subdirectory, not the filesystem root or current directory",
      );
    await parentsSafe(target);
    const input = await fs.open(file, "r");
    let header, offset;
    try {
      const prefix = Buffer.alloc(4096);
      const { bytesRead } = await input.read(prefix, 0, prefix.length, 0);
      offset = prefix.subarray(0, bytesRead).indexOf(10);
      if (
        offset < 0 ||
        !prefix.subarray(0, offset).toString().startsWith(MAGIC)
      )
        throw Error("Unsupported cache archive");
      header = JSON.parse(prefix.subarray(MAGIC.length, offset).toString());
      offset++;
    } finally {
      await input.close();
    }
    if (
      !["file", "directory"].includes(header.kind) ||
      !["zstd", "gzip", "none"].includes(header.compression) ||
      !/^[a-f0-9]{64}$/.test(header.sha256)
    )
      throw Error("Invalid cache archive metadata");
    const hash = createHash("sha256");
    await pipeline(
      createReadStream(file, { start: offset }),
      meter(hash),
      new Transform({
        transform(_c, _e, cb) {
          cb();
        },
      }),
    );
    if (hash.digest("hex") !== header.sha256)
      throw Error("Cache checksum mismatch");
    await fs.mkdir(dirname(target), { recursive: true });
    const staging = await fs.mkdtemp(
      join(dirname(target), ".fluentci-restore-"),
    );
    let backedUp = false,
      committed = false;
    try {
      const decoded = join(staging, "decoded");
      await pipeline(
        createReadStream(file, { start: offset }),
        codec(header.compression, true),
        meter(),
        createWriteStream(decoded, { mode: 0o600 }),
      );
      let next = decoded;
      if (header.kind === "file" && header.mode !== undefined) {
        if (
          !Number.isInteger(header.mode) ||
          header.mode < 0 ||
          header.mode > 0o777
        )
          throw Error("Invalid cached file mode");
        await fs.chmod(decoded, header.mode);
      }
      if (header.kind === "directory") {
        let unsafe = false,
          total = 0;
        await tar.t({
          file: decoded,
          strict: true,
          onReadEntry(entry) {
            total += entry.size;
            if (
              total > MAX_BYTES ||
              !entry.path ||
              isAbsolute(entry.path) ||
              /^[A-Za-z]:/.test(entry.path) ||
              entry.path.includes("\\") ||
              entry.path.split("/").includes("..") ||
              ![
                "File",
                "OldFile",
                "ContiguousFile",
                "Directory",
                "Link",
                "SymbolicLink",
              ].includes(entry.type) ||
              (["Link", "SymbolicLink"].includes(entry.type) &&
                (!entry.linkpath ||
                  isAbsolute(entry.linkpath) ||
                  /^[A-Za-z]:/.test(entry.linkpath) ||
                  entry.linkpath.includes("\\") ||
                  entry.linkpath.split("/").includes("..")))
            )
              unsafe = true;
          },
        });
        if (unsafe) throw Error("Unsafe cache archive entry or expanded size");
        next = join(staging, "directory");
        await fs.mkdir(next);
        await tar.x({
          file: decoded,
          cwd: next,
          strict: true,
          preservePaths: false,
          noChmod: true,
          preserveOwner: false,
          onReadEntry(entry) {
            entry.mode &= 0o777;
          },
        });
      }
      try {
        await fs.rename(target, join(staging, "previous"));
        backedUp = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      try {
        await fs.rename(next, target);
        committed = true;
      } catch (error) {
        if (backedUp) {
          await fs.rename(join(staging, "previous"), target);
          backedUp = false;
        }
        throw error;
      }
      return String((await fs.stat(file)).size);
    } finally {
      // Keep the previous tree if an unexpected filesystem error prevented rollback.
      if (committed || !backedUp)
        await fs.rm(staging, { recursive: true, force: true });
    }
  })();
export const writeFiles = (directory) => (files) => () =>
  (async () => {
    const target = resolve(directory);
    // Fresh directories make generated client configuration reviewable and avoid overwrites.
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.mkdir(target);
    try {
      for (const file of files)
        await fs.writeFile(join(target, file.name), file.text, {
          mode: file.executable ? 0o700 : 0o600,
          flag: "wx",
        });
      return files.map((file) => join(target, file.name));
    } catch (error) {
      await fs.rm(target, { recursive: true, force: true });
      throw error;
    }
  })();
export const hooks = {};
export const platform = () => ({ os: process.platform, arch: process.arch });
export const installSccache = (url) => (asset) => (binary) => () =>
  (async () => {
    const root = join(
      process.env.RUNNER_TEMP || tmpdir(),
      "fluentci-sccache",
      asset.replace(/\.tar\.gz$/, ""),
    );
    const executable = join(root, binary);
    try {
      await fs.access(executable);
      return { executable, binDir: root };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.mkdir(dirname(root), { recursive: true });
    const staging = await fs.mkdtemp(join(dirname(root), ".install-"));
    try {
      const [response, checksum] = await Promise.all([
        fetch(url, { signal: AbortSignal.timeout(120000) }),
        fetch(url + ".sha256", { signal: AbortSignal.timeout(30000) }),
      ]);
      if (!response.ok || !checksum.ok)
        throw Error(
          "Could not download the pinned sccache release and checksum",
        );
      const expected = (await checksum.text())
        .match(/\b[a-fA-F0-9]{64}\b/)?.[0]
        ?.toLowerCase();
      if (!expected) throw Error("Invalid sccache checksum");
      const hash = createHash("sha256"),
        archive = join(staging, "archive");
      await pipeline(
        response.body,
        meter(hash, 200 * 1024 ** 2),
        createWriteStream(archive, { mode: 0o600 }),
      );
      if (hash.digest("hex") !== expected)
        throw Error("sccache release checksum mismatch");
      const extracted = join(staging, "extracted");
      await fs.mkdir(extracted);
      await tar.x({
        file: archive,
        cwd: extracted,
        strip: 1,
        strict: true,
        preservePaths: false,
      });
      await fs.access(join(extracted, binary));
      await fs.chmod(join(extracted, binary), 0o755);
      try {
        await fs.rename(extracted, root);
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      }
      return { executable, binDir: root };
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  })();

export const parentPath = (path) => dirname(path);
export const sccacheVersion = (executable) => () =>
  runSccache(executable, ["--version"], false);
export const stopSccache = (executable) => () =>
  runSccache(executable, ["--stop-server"], true).then(() => {});
async function runSccache(executable, args, ignoreExit) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (text += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 || ignoreExit
        ? resolve(text.trim())
        : reject(Error("sccache verification failed")),
    );
  });
}

// OCI repository names disallow colons; preserve the DID reversibly.
export const registryAccount = (did) =>
  did.startsWith("did:plc:")
    ? "did-plc-" + did.slice(8)
    : did.startsWith("did:web:")
      ? "did-web-" + Buffer.from(did.slice(8), "utf8").toString("hex")
      : (() => {
          throw Error("Expected cache owner DID");
        })();
