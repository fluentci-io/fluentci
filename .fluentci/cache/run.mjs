// JavaScript interoperability entry point. Publisher logic is PureScript.
import * as Publisher from "./output/CI.CacheHost/index.js";
import { fromAff } from "./output/Control.Promise/index.js";
import { commandRaw } from "./src/CI/CacheHost.js";
import { pathToFileURL } from "node:url";

const promise = (aff) => fromAff(aff)();
export const command = commandRaw;
export function configuration(env) {
  const result = Publisher.configuration(env)();
  return { ...result, cache: result.cache || undefined };
}
export function uploadFile(path, url, token, fetcher = fetch, options = {}) {
  return promise(
    Publisher.uploadFile({ ...options, fetcher })(path)(url)(token)(
      options.maxAttempts ?? 4,
    )(options.timeoutMs ?? 125 * 60 * 1000),
  );
}
export function uploadFiles(
  directory,
  cache,
  token,
  fetcher = fetch,
  metadataFiles,
  options = {},
) {
  return promise(
    Publisher.uploadFiles({ ...options, fetcher })(directory)(cache)(token)(
      metadataFiles ?? [],
    )(options.maxAttempts ?? 4)(options.timeoutMs ?? 125 * 60 * 1000),
  );
}
export function requireSignatures(directory, publicKey, metadataFiles) {
  return promise(
    Publisher.requireSignatures(directory)(publicKey)(metadataFiles ?? []),
  );
}
export function seedAvailablePaths(directory, paths, cache, fetcher = fetch) {
  return promise(
    Publisher.seedAvailablePaths({ fetcher })(directory)(paths)(cache),
  );
}
export function build(
  env = process.env,
  run = command,
  upload = uploadFiles,
  options = {},
) {
  return promise(
    Publisher.build({ ...options, run, upload })(env)(
      options.flake ?? ".#default",
    )(options.pollIntervalMs ?? 2000),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
