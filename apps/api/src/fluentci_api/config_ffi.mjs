import { ids, schemas } from './lexicon/schemas.mjs';
export const root = () => process.env.FLUENTCI_API_ROOT ?? process.cwd();
export const lexicons = () => structuredClone(schemas);
export const COLLECTION = ids.plugin;
export const PUBLISH = ids.registry_publish;
export const RECORD_DOWNLOAD = ids.registry_record_download;
export const MAX_WASM_BYTES = 64 * 1024 * 1024;
export const DEFAULT_JETSTREAM_URLS = Object.freeze([
  'wss://jetstream1.us-east.bsky.network/subscribe',
  'wss://jetstream2.us-east.bsky.network/subscribe',
  'wss://jetstream1.us-west.bsky.network/subscribe',
  'wss://jetstream2.us-west.bsky.network/subscribe',
]);
export function sources(env = process.env) {
  const configured = env.JETSTREAM_URLS?.trim() || env.JETSTREAM_URL?.trim();
  return [
    ...new Set(
      (configured ? configured.split(',').map((url) => url.trim()) : DEFAULT_JETSTREAM_URLS).map(
        (url) => new URL(url).href,
      ),
    ),
  ];
}
export const source = () => sources()[0];
