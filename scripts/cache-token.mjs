#!/usr/bin/env node
import { appendFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function exchangeCredential(
  credential,
  apiUrl = "https://api.fluentci.io",
  request = fetch,
) {
  if (
    !credential ||
    !/^fc_cache_ci_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(credential)
  )
    throw Error(
      "Set FLUENTCI_CACHE_CREDENTIAL to an owner-created CI credential",
    );
  const base = new URL(apiUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error(
      "FLUENTCI_API_URL must be an HTTPS URL without credentials, query or fragment",
    );
  const response = await request(
    `${base.href.replace(/\/$/, "")}/xrpc/io.fluentci.cache.exchangeCredential`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw Error(
      `Cache credential exchange failed (HTTP ${response.status}); check credential expiry and revocation`,
    );
  const data = await response.json();
  if (
    typeof data.token !== "string" ||
    !/^[A-Za-z0-9_.-]+$/.test(data.token) ||
    typeof data.cacheUrl !== "string"
  )
    throw Error("Invalid cache token response");
  const url = new URL(data.cacheUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\r\n']/.test(data.cacheUrl) ||
    (data.expiresAt !== undefined &&
      (typeof data.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(data.expiresAt)) ||
        Date.parse(data.expiresAt) <= Date.now()))
  )
    throw Error("Invalid cache URL or expiry");
  return {
    token: data.token,
    cacheUrl: url.href,
    ...(data.expiresAt === undefined
      ? {}
      : { expiresAt: new Date(data.expiresAt).toISOString() }),
  };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const github = args.length === 1 && args[0] === "--github-env";
  const envFile =
    args.length === 2 && args[0] === "--env-file"
      ? resolve(args[1])
      : undefined;
  if ((!github && !envFile) || (github && !env.GITHUB_ENV))
    throw Error("Usage: cache-token.mjs --github-env | --env-file PATH");
  const value = await exchangeCredential(
    env.FLUENTCI_CACHE_CREDENTIAL,
    env.FLUENTCI_API_URL,
  );
  if (github) {
    process.stdout.write(`::add-mask::${value.token}\n`);
    appendFileSync(
      env.GITHUB_ENV,
      `FLUENTCI_CACHE_URL=${value.cacheUrl}\nFLUENTCI_CACHE_TOKEN=${value.token}\nFLUENTCI_CACHE_EXPIRES_AT=${value.expiresAt ?? ""}\n`,
    );
  } else {
    const temporary = `${envFile}.${randomUUID()}.tmp`;
    writeFileSync(
      temporary,
      `FLUENTCI_CACHE_URL='${value.cacheUrl}'\nFLUENTCI_CACHE_TOKEN='${value.token}'\nFLUENTCI_CACHE_EXPIRES_AT='${value.expiresAt ?? ""}'\n`,
      { mode: 0o600, flag: "wx" },
    );
    renameSync(temporary, envFile);
  }
  process.stderr.write(
    value.expiresAt
      ? `Cache upload token expires ${value.expiresAt}\n`
      : "Cache upload token remains valid until revoked\n",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    // Avoid printing request errors that might include authorization headers.
    process.stderr.write(
      "Could not obtain a cache upload token. Check arguments, connectivity, signing configuration, and CI credential validity.\n",
    );
    process.exitCode = 1;
  });
}
