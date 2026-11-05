import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
export const root=()=>process.env.FLUENTCI_API_ROOT ?? process.cwd();
export function lexicons(directory=resolve(root(),'lexicons')) {
 return readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?lexicons(join(directory,e.name)):e.name.endsWith('.json')?[JSON.parse(readFileSync(join(directory,e.name),'utf8'))]:[]);
}
export const COLLECTION='io.fluentci.plugin';
export const PUBLISH='io.fluentci.registry.publish';
export const MAX_WASM_BYTES=64*1024*1024;
export const source=()=>process.env.JETSTREAM_URL ?? 'wss://jetstream2.us-east.bsky.network/subscribe';
