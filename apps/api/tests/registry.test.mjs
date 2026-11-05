import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Secp256k1Keypair} from '@atproto/crypto';
import {createServiceJwt} from '@atproto/xrpc-server';
import {WebSocketServer} from 'ws';
process.env.FLUENTCI_API_ROOT=fileURLToPath(new URL('..',import.meta.url));
const db=await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
const runtime=await import('../build/dev/javascript/fluentci_api/fluentci_api/node/runtime_ffi.mjs');
const {register}=await import('../build/dev/javascript/fluentci_api/fluentci_api/xrpc/routes.mjs');
const {ingest}=await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client.mjs');
const wire=await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client_ffi.mjs');
const model=await import('../build/dev/javascript/fluentci_api/fluentci_api/model.mjs');
const did='did:plc:abcdefghijklmnopqrstuvwx';
const other='did:plc:zyxwvutsrqponmlkjihgfedcb';
const cid='bafyreia'.padEnd(59,'a');
const wasm=Buffer.from([0,97,115,109,1,0,0,0]);
const digest=createHash('sha256').update(wasm).digest('hex');
function event(name='hello',version='1.0.0',time=100,author=did,overrides={}) {
 return {did:author,time_us:time,kind:'commit',commit:{operation:'create',collection:'io.fluentci.plugin',rkey:`${name}-${version}`,cid,
 record:{$type:'io.fluentci.plugin',name,version,description:'Useful build pipeline',author,license:'MIT',publishedAt:'2026-11-05T00:00:00.000Z',url:`https://plugins.example/${name}.wasm`,sha256:digest,size:8,...overrides}}};
}
async function fixture(t){const dir=mkdtempSync(join(tmpdir(),'fluentci-api-test-'));const connection=await db.open({url:`file:${join(dir,'registry.sqlite')}`});t.after(async()=>{await db.close(connection);rmSync(dir,{recursive:true,force:true});});return connection;}
async function add(connection,...events){for(const e of events)await ingest(connection,JSON.stringify(e));}
async function server(t,connection,options={}) {
 const instance=runtime.create(connection,options);register(instance,connection);
 const http=runtime.app(instance).listen(0,'127.0.0.1');await once(http,'listening');
 t.after(()=>new Promise(resolve=>http.close(resolve)));
 return {instance,url:`http://127.0.0.1:${http.address().port}`};
}

test('migrations, search, SemVer latest selection, and stable query-bound pagination',async t=>{
 const connection=await fixture(t);
 await add(connection,event('alpha','1.9.0',100),event('alpha','1.10.0',101),event('alpha','2.0.0-beta.1',102),event('beta','1.0.0',103));
 assert.equal((await db.getPackage(connection,'alpha','',did)).version,'1.10.0');
 let page=await db.listPackages(connection,'','',2,'');assert.equal(page.packages.toArray().length,2);
 const next=await db.listPackages(connection,'','',2,page.cursor[0]);assert.equal(next.packages.toArray().length,2);
 assert.equal(new Set([...page.packages.toArray(),...next.packages.toArray()].map(p=>p.uri)).size,4);
 await assert.rejects(db.listPackages(connection,'alpha','',2,page.cursor[0]),/Cursor/);
 assert.equal((await db.listPackages(connection,'%','',20,'')).packages.toArray().length,0);
 assert.equal((await db.listPackages(connection,'Useful','',20,'')).packages.toArray().length,4);
});

test('Jetstream is idempotent, rejects forged records, and persists delete tombstones and account state',async t=>{
 const connection=await fixture(t);const first=event();await add(connection,first,first);
 assert.equal((await db.listPackages(connection,'','',20,'')).packages.toArray().length,1);
 await add(connection,event('forged','1.0.0',110,did,{author:other}),event('bad-url','1.0.0',111,did,{url:'https://example.com/archive.zip'}));
 assert.equal((await db.listPackages(connection,'','',20,'')).packages.toArray().length,1);
 const deleted={...first,time_us:200,commit:{...first.commit,operation:'delete'}};
 await add(connection,deleted,{...first,time_us:150});
 assert.equal((await db.listPackages(connection,'','',20,'')).packages.toArray().length,0);
 assert.equal(await db.cursor(connection),200);
 await add(connection,{...first,time_us:300});
 await add(connection,{kind:'account',did,time_us:400,account:{active:false}});
 assert.equal((await db.listPackages(connection,'','',20,'')).packages.toArray().length,0);
 await add(connection,{kind:'account',did,time_us:500,account:{active:true}});
 assert.equal((await db.listPackages(connection,'','',20,'')).packages.toArray().length,1);
});

test('package names are publisher scoped and getPackage rejects ambiguous names',async t=>{
 const connection=await fixture(t);await add(connection,event(),event('hello','1.0.0',101,other));
 await assert.rejects(db.getPackage(connection,'hello','',''),/disambiguate/);
 assert.equal((await db.getPackage(connection,'hello','1.0.0',other)).author,other);
});

test('real XRPC query routes return validated schemas, pagination, and useful errors',async t=>{
 const connection=await fixture(t);await add(connection,event());const {url}=await server(t,connection);
 const get=await fetch(`${url}/xrpc/io.fluentci.registry.getPackage?name=hello&author=${did}`);
 assert.equal(get.status,200);assert.equal((await get.json()).package.url,'https://plugins.example/hello.wasm');
 const search=await fetch(`${url}/xrpc/io.fluentci.registry.searchPackages?q=hello`);assert.equal(search.status,200);assert.equal((await search.json()).packages.length,1);
 const list=await fetch(`${url}/xrpc/io.fluentci.registry.listPackages?limit=1`);assert.equal(list.status,200);
 const invalid=await fetch(`${url}/xrpc/io.fluentci.registry.listPackages?limit=101`);assert.equal(invalid.status,400);
 const missing=await fetch(`${url}/xrpc/io.fluentci.registry.getPackage?name=missing`);assert.equal((await missing.json()).error,'PackageNotFound');
});

test('publish requires scoped service auth, validates Wasm, and sends immutable objects to S3',async t=>{
 const connection=await fixture(t);const keypair=await Secp256k1Keypair.create();
 const {instance,url}=await server(t,connection,{resolveSigningKey:async()=>keypair.did()});
 const oldBucket=process.env.S3_BUCKET, oldUrl=process.env.S3_PUBLIC_URL;
 process.env.S3_BUCKET='plugins';process.env.S3_PUBLIC_URL='https://cdn.example/artifacts';
 t.after(()=>{if(oldBucket===undefined)delete process.env.S3_BUCKET;else process.env.S3_BUCKET=oldBucket;if(oldUrl===undefined)delete process.env.S3_PUBLIC_URL;else process.env.S3_PUBLIC_URL=oldUrl;});
 const commands=[];instance.s3={send:async command=>commands.push(command)};
 const endpoint=`${url}/xrpc/io.fluentci.registry.publish`;
 const anonymous=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/wasm'},body:wasm});assert.equal(anonymous.status,401);
 const jwt=await createServiceJwt({iss:did,aud:'did:web:api.fluentci.io',lxm:'io.fluentci.registry.publish',keypair});
 const headers={'Content-Type':'application/wasm',Authorization:`Bearer ${jwt}`};
 const invalid=await fetch(endpoint,{method:'POST',headers,body:Buffer.from('not wasm')});assert.equal(invalid.status,400);assert.equal(commands.length,0);
 const badJwt=await createServiceJwt({iss:did,aud:'did:web:other.example',lxm:'io.fluentci.registry.publish',keypair});
 assert.equal((await fetch(endpoint,{method:'POST',headers:{...headers,Authorization:`Bearer ${badJwt}`},body:wasm})).status,401);
 const uploaded=await fetch(endpoint,{method:'POST',headers,body:wasm});assert.equal(uploaded.status,200);
 const output=await uploaded.json();assert.equal(output.sha256,digest);assert.equal(output.size,8);assert.ok(output.url.endsWith('.wasm'));
 assert.equal(commands.length,1);assert.deepEqual(commands[0].input.Body,wasm);assert.equal(commands[0].input.ContentType,'application/wasm');
 assert.match(commands[0].input.CacheControl,/immutable/);
 instance.s3={send:async()=>{throw Error('storage offline');}};
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:wasm})).status,503);
});

test('Jetstream subscribes to the collection and indexes a real WebSocket message',async t=>{
 const connection=await fixture(t);const ws=new WebSocketServer({port:0,host:'127.0.0.1'});await once(ws,'listening');
 let query;
 ws.on('connection',(socket,request)=>{query=new URL(request.url,'http://localhost');socket.send(JSON.stringify(event('socket-plugin','1.0.0',123)));});
 const stop=wire.start(connection,message=>ingest(connection,message),{url:`ws://127.0.0.1:${ws.address().port}`});
 t.after(async()=>{stop();await stop.drain();for(const client of ws.clients)client.terminate();await new Promise(resolve=>ws.close(resolve));});
 for(let i=0;i<100;i++){if(await db.cursor(connection)===123)break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(query.searchParams.get('wantedCollections'),'io.fluentci.plugin');
 assert.equal((await db.getPackage(connection,'socket-plugin','1.0.0',did)).name,'socket-plugin');
});
