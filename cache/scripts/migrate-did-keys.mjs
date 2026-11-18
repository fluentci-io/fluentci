#!/usr/bin/env node
// Copy legacy account namespaces to owner DIDs. Sources are retained for rollback.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const apply = args.includes("--apply");
const concurrency = Number(option("--concurrency", "32"));
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 128)
  throw Error("Concurrency must be 1..128");
const envFile = option("--env-file", "/etc/fluentci/cache.env");
const env = { ...parseEnv(readFileSync(envFile, "utf8")), ...process.env };
const prefix =
  (env.FLUENTCI_CACHE_PREFIX ?? "fluentci-cache/v1").replace(/\/$/, "") + "/";
const Bucket = env.FLUENTCI_CACHE_BUCKET;
if (!Bucket || !env.FLUENTCI_CACHE_ENDPOINT)
  throw Error("Set cache bucket and endpoint");
const client = new S3Client({
  endpoint: env.FLUENTCI_CACHE_ENDPOINT,
  region: env.FLUENTCI_CACHE_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 8,
});
const db = new DatabaseSync(
  option("--database", "/var/lib/fluentci/registry.sqlite"),
  { readOnly: true },
);
const owners = new Map();
for (const table of [
  "cache_tokens",
  "cache_members",
  "cache_credentials",
  "cache_usage_owners",
  "cache_usage",
]) {
  for (const { owner } of db
    .prepare(`SELECT DISTINCT owner FROM ${table}`)
    .all()) {
    if (!/^did:(plc|web):[^/\s]+$/.test(owner))
      throw Error(`Invalid owner in ${table}`);
    owners.set(createHash("sha256").update(owner).digest("hex"), owner);
  }
}
db.close();
async function list() {
  const objects = new Map();
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }),
    );
    for (const object of page.Contents ?? []) objects.set(object.Key, object);
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return objects;
}
const objects = await list();
const plan = [];
const unknown = new Set();
for (const [key, source] of objects) {
  const match = key
    .slice(prefix.length)
    .match(/^(accounts|_revocations)\/([a-f0-9]{64})\/(.+)$/);
  if (!match) continue;
  const [, kind, hash, relative] = match;
  const owner = owners.get(hash);
  if (!owner) {
    unknown.add(hash);
    continue;
  }
  const target = `${prefix}${kind}/${owner}/${relative}`;
  plan.push({
    source: key,
    target,
    meta: source,
    pointer: kind === "accounts" && /^(nx|turbo)\/[^/]+$/.test(relative),
  });
}
if (unknown.size)
  console.log(
    JSON.stringify({
      unresolved: [...unknown],
      action: "retained without reassignment",
      objects: [...objects.keys()]
        .filter((key) =>
          [...unknown].some((id) => key.includes("/" + id + "/")),
        )
        .map((key) => ({ key, bytes: Number(objects.get(key).Size) })),
    }),
  );
console.log(
  JSON.stringify({
    mode: apply ? "copy-and-verify" : "inventory",
    owners: [...owners.values()],
    objects: objects.size,
    legacyObjects: plan.length,
    bytes: plan.reduce((n, item) => n + Number(item.meta.Size), 0),
    databaseChanges: 0,
  }),
);
if (!apply) process.exit(0);
let copied = 0,
  reused = 0,
  completed = 0;
const manifest = [];
async function migrate(item) {
  const existing = objects.get(item.target);
  // Never replace objects already written by the DID-aware server.
  if (existing && existing.LastModified >= item.meta.LastModified) {
    reused++;
    return;
  }
  let result;
  let size = Number(item.meta.Size);
  if (item.pointer) {
    const source = await client.send(
      new GetObjectCommand({
        Bucket,
        Key: item.source,
        IfMatch: item.meta.ETag,
      }),
    );
    const value = JSON.parse(await source.Body.transformToString());
    const oldRoot =
      item.source.slice(prefix.length).split("/").slice(0, 2).join("/") + "/";
    const newRoot =
      item.target.slice(prefix.length).split("/").slice(0, 2).join("/") + "/";
    if (typeof value.path !== "string" || !value.path.startsWith(oldRoot))
      throw Error("Unexpected artifact pointer: " + item.source);
    value.path = newRoot + value.path.slice(oldRoot.length);
    const Body = JSON.stringify(value);
    size = Buffer.byteLength(Body);
    result = await client.send(
      new PutObjectCommand({
        Bucket,
        Key: item.target,
        Body,
        ContentType: source.ContentType,
        Metadata: source.Metadata,
      }),
    );
  } else {
    result = await client.send(
      new CopyObjectCommand({
        Bucket,
        Key: item.target,
        CopySource:
          "/" +
          Bucket +
          "/" +
          item.source.split("/").map(encodeURIComponent).join("/"),
        CopySourceIfMatch: item.meta.ETag,
        MetadataDirective: "COPY",
      }),
    );
  }
  const etag = result.CopyObjectResult?.ETag ?? result.ETag;
  const head = await client.send(
    new HeadObjectCommand({ Bucket, Key: item.target }),
  );
  if (Number(head.ContentLength) !== size || (etag && head.ETag !== etag))
    throw Error("Copy verification failed: " + item.target);
  manifest.push({
    source: item.source,
    target: item.target,
    sourceETag: item.meta.ETag,
    targetETag: head.ETag,
    size,
  });
  copied++;
}
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < plan.length) {
      const item = plan[next++];
      await migrate(item);
      completed++;
      if (completed % 250 === 0)
        console.log(
          JSON.stringify({ completed, total: plan.length, copied, reused }),
        );
    }
  }),
);
writeFileSync(
  option("--report", "/var/lib/fluentci-cache/did-migration-report.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      copied,
      reused,
      databaseChanges: 0,
      manifest,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    complete: true,
    copied,
    reused,
    sourcesRetained: true,
    databaseChanges: 0,
  }),
);
