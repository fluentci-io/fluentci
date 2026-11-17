import { fileURLToPath } from 'node:url';
process.env.FLUENTCI_API_ROOT ??= fileURLToPath(new URL('..', import.meta.url));
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const native = await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
const usage = await import('../build/dev/javascript/fluentci_api/fluentci_api/db/cache_usage.mjs');
const { manageCache } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/xrpc/cache_ffi.mjs');
const db = await native.open();
try {
  let cursor = '',
    count = 0;
  while (true) {
    const owners = (await usage.owners(db, cursor)).toArray();
    if (!owners.length) break;
    for (const { owner } of owners) {
      try {
        await manageCache(
          { options: {} },
          { auth: { credentials: { did: owner } }, input: { body: {} } },
          'list',
          (...args) => usage.record(db, ...args),
        );
        count++;
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'cache_usage_snapshot_failed',
            error: error.customErrorName ?? error.name,
          }),
        );
        process.exitCode = 1;
      }
    }
    cursor = owners.at(-1).owner;
  }
  console.info(JSON.stringify({ event: 'cache_usage_snapshots', owners: count }));
} finally {
  await native.close(db);
}
