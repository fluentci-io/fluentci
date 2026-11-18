// Operational cleanup; application predicates and deletions live in Gleam.
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply'))
  throw Error('Usage: node scripts/prune-jetstream.mjs [--apply]');
process.env.FLUENTCI_API_ROOT ??= fileURLToPath(new URL('..', import.meta.url));
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const native = await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
const participants =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/db/participants.mjs');
const db = await native.open({ migrate: false });
try {
  const [orphanAccounts, legacyEvents, retainedAccounts] = await participants.inventory(db);
  console.log(
    JSON.stringify({
      mode: args.includes('--apply') ? 'apply' : 'inventory',
      orphanAccounts,
      legacyEvents,
      retainedAccounts,
    }),
  );
  if (args.includes('--apply')) {
    const [removedAccounts, removedLegacyEvents] = await participants.cleanup(db);
    const [remainingOrphans, remainingLegacyEvents, retainedAfter] =
      await participants.inventory(db);
    if (remainingOrphans || remainingLegacyEvents || retainedAfter < retainedAccounts)
      throw Error('Cleanup verification failed');
    console.log(
      JSON.stringify({
        complete: true,
        removedAccounts,
        removedLegacyEvents,
        retainedAccounts: retainedAfter,
        checkpointsPreserved: true,
      }),
    );
  }
} finally {
  await native.close(db);
}
