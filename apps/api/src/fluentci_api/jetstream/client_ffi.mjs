import {RegistryPackageView as Package} from '../lexicon/models.mjs';
import WebSocket from 'ws';
import {Lexicons} from '@atproto/lexicon';
import {Upsert,Delete,Account,Checkpoint} from '../model.mjs';
import {Ok,Error as GError} from '../../gleam.mjs';
import {lexicons,COLLECTION,source} from '../config_ffi.mjs';
import {cursor,close} from '../db/client_ffi.mjs';
import semver from 'semver';
let validators;
export function decodeEvent(message){
 try{validators ??= new Lexicons(lexicons());const event=JSON.parse(message);
  if(!Number.isSafeInteger(event.time_us)||event.time_us<0)throw new Error('Invalid event time');
  if(typeof event.did!=='string'||!event.did.startsWith('did:'))throw new Error('Invalid event DID');
  if(event.kind==='account'&&typeof event.account?.active==='boolean')return new Ok(new Account(event.did,event.account.active,event.time_us));
  if(event.kind!=='commit'||event.commit?.collection!==COLLECTION)return new Ok(new Checkpoint(event.time_us));
  const c=event.commit;if(typeof c.rkey!=='string'||!/^[-A-Za-z0-9._:~]{1,512}$/.test(c.rkey)||['.','..'].includes(c.rkey))throw new Error('Invalid record key');
  const uri=`at://${event.did}/${COLLECTION}/${c.rkey}`;
  if(c.operation==='delete')return new Ok(new Delete(uri,event.did,event.time_us));
  if(!['create','update'].includes(c.operation))throw new Error('Unknown commit operation');
  const result=validators.validate(COLLECTION,c.record);if(!result.success)throw result.error;const p=c.record;
  if(p.$type!==COLLECTION||p.author!==event.did||c.rkey!==`${p.name}-${p.version}`)throw new Error('Record ownership or key mismatch');
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(p.name)||!semver.valid(p.version)||p.version.includes('+'))throw new Error('Invalid package name/version');
  if(!/^[a-f0-9]{64}$/.test(p.sha256))throw new Error('Invalid checksum');
  const url=new URL(p.url);if(!['https:','http:'].includes(url.protocol)||!url.pathname.endsWith('.wasm')||url.username||url.password)throw new Error('Invalid Wasm URL');
  if(typeof c.cid!=='string'||!c.cid.length)throw new Error('Missing record CID');
  return new Ok(new Upsert(new Package(p.name,p.description,p.version,new Date(p.publishedAt).toISOString(),p.author,p.license,p.url,p.sha256,p.size,uri,c.cid),event.time_us));
 }catch(error){return new GError(error.message);}
}
export function start(connection,ingest,options={}){
 if(process.env.JETSTREAM_ENABLED==='false'&&!options.url)return ()=>{};
 let stopped=false,socket,timer,attempt=0,processing=Promise.resolve();
 const schedule=()=>{if(stopped)return;timer=setTimeout(()=>{processing.catch(()=>{}).then(()=>{processing=Promise.resolve();connect().catch(failed);});},Math.min(30_000,500*2**attempt++));};
 const failed=error=>{console.error('Jetstream:',error.message);schedule();};
 const connect=async()=>{if(stopped)return;const url=new URL(options.url ?? source());url.searchParams.set('wantedCollections',COLLECTION);
  const saved=await cursor(connection);if(saved)url.searchParams.set('cursor',String(Math.max(0,saved-10_000_000)));
  socket=new WebSocket(url,{maxPayload:2*1024*1024});let queued=0;
  socket.on('open',()=>{attempt=0;console.info('Jetstream connected');});
  socket.on('message',bytes=>{if(stopped)return;if(++queued>1000){socket.terminate();return;}
   processing=processing.then(()=>ingest(bytes.toString())).catch(error=>{console.error('Index failed; replaying from durable checkpoint:',error.message);socket.terminate();throw error;}).finally(()=>{queued--;});processing.catch(()=>{});
  });
  socket.on('error',error=>console.error('Jetstream:',error.message));socket.on('close',schedule);
 };
 connect().catch(failed);
 const stop=()=>{stopped=true;clearTimeout(timer);socket?.close();};stop.drain=()=>processing.catch(()=>{});return stop;
}
export function standalone(connection,stop){const shutdown=async()=>{stop();await stop.drain?.();await close(connection);};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);}
