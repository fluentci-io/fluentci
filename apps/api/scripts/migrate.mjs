import { fileURLToPath } from 'node:url';
process.env.FLUENTCI_API_ROOT ??= fileURLToPath(new URL('..', import.meta.url));
const {open,close} = await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
await close(await open());
console.info('Registry SQLite migrations complete');
