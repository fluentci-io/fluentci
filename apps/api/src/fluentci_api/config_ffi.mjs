import {ids,schemas} from './lexicon/schemas.mjs';
export const root=()=>process.env.FLUENTCI_API_ROOT ?? process.cwd();
export const lexicons=()=>structuredClone(schemas);
export const COLLECTION=ids.plugin;
export const PUBLISH=ids.registry_publish;
export const MAX_WASM_BYTES=64*1024*1024;
export const source=()=>process.env.JETSTREAM_URL ?? 'wss://jetstream2.us-east.bsky.network/subscribe';
