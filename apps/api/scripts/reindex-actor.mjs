import { fileURLToPath } from 'node:url';
import { IdResolver } from '@atproto/identity';

const actor = process.argv[2];
if (!actor?.startsWith('did:')) throw Error('Usage: node scripts/reindex-actor.mjs did:plc:...');
process.env.FLUENTCI_API_ROOT ??= fileURLToPath(new URL('..', import.meta.url));
const document = await new IdResolver().did.resolve(actor);
const pds = document?.service?.find((service) =>
  service.id.endsWith('#atproto_pds'),
)?.serviceEndpoint;
if (typeof pds !== 'string' || !pds.startsWith('https://'))
  throw Error('Publisher has no HTTPS PDS');
const { open, close } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
const { decodeEvent } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client_ffi.mjs');
const { ingest } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client.mjs');
const connection = await open({ source: `pds-reconcile:${actor}` });
let cursor;
let count = 0;
try {
  do {
    // Snapshot time precedes the fetch so subsequent live updates win naturally.
    const snapshot = Date.now() * 1000;
    const url = new URL('/xrpc/com.atproto.repo.listRecords', pds);
    url.search = new URLSearchParams({
      repo: actor,
      collection: 'io.fluentci.plugin',
      limit: '100',
      ...(cursor ? { cursor } : {}),
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Error(`PDS listRecords returned HTTP ${response.status}`);
    const page = await response.json();
    for (const record of page.records) {
      if (!record.uri.startsWith(`at://${actor}/io.fluentci.plugin/`))
        throw Error('PDS returned a different repository');
      const message = JSON.stringify({
        did: actor,
        kind: 'commit',
        time_us: snapshot,
        commit: {
          collection: 'io.fluentci.plugin',
          operation: 'update',
          rkey: record.uri.split('/').at(-1),
          cid: record.cid,
          rev: `pds:${record.cid}`,
          record: record.value,
        },
      });
      const decoded = decodeEvent(message);
      if (!decoded.isOk()) throw Error(`Rejected ${record.uri}: ${decoded[0]}`);
      await ingest(connection, message);
      count++;
    }
    cursor = page.cursor;
  } while (cursor);
  console.log(`Reconciled ${count} published records for ${actor}`);
} finally {
  await close(connection);
}
