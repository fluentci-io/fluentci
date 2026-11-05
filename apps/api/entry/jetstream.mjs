import { fileURLToPath } from 'node:url';
process.env.FLUENTCI_API_ROOT ??= fileURLToPath(new URL('..', import.meta.url));
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const { main } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client.mjs');
main();
