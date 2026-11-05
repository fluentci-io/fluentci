import {resolve} from 'node:path';
import {root} from './config_ffi.mjs';
export const get=name=>process.env[name] ?? '';
const loopback=host=>['localhost','127.0.0.1','[::1]'].includes(host);
export function validHttp(value){try{const u=new URL(value);return (u.protocol==='https:'||(u.protocol==='http:'&&loopback(u.hostname)))&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}}
export function validStream(value){try{const u=new URL(value);return (u.protocol==='wss:'||(u.protocol==='ws:'&&loopback(u.hostname)))&&!u.username&&!u.password&&!u.hash;}catch{return false;}}
export const validDid=value=>/^did:(plc:[a-z2-7]{24}|web:[A-Za-z0-9%._:-]+)$/.test(value);
export const validDatabase=value=>value.startsWith('file:')&&value.slice(5).trim()!==''&&!value.includes('\0')&&!value.includes('?')&&!value.includes('#')&&value.slice(5)!==':memory:';
export function apply(config){
 process.env.HOST=config.host;process.env.PORT=String(config.port);
 process.env.DATABASE_URL=config.database_url.startsWith('file:')&&!config.database_url.startsWith('file:/')?`file:${resolve(root(),config.database_url.slice(5))}`:config.database_url;
 process.env.SERVICE_DID=config.service_did;process.env.JETSTREAM_URL=config.jetstream_url;
}
export function abort(errors){
 console.error(`Invalid FluentCI API environment:\n${errors.toArray().map(error=>`  - ${error}`).join('\n')}`);
 process.exit(1);
}
