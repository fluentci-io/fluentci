import express from 'express';
import {createServer,AuthRequiredError,InvalidRequestError,XRPCError,verifyJwt} from '@atproto/xrpc-server';
import {IdResolver} from '@atproto/identity';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {lexicons,PUBLISH,MAX_WASM_BYTES} from '../config_ffi.mjs';
import {close} from '../db/client_ffi.mjs';
const identity=new IdResolver();
export function create(database,options={}){return {xrpc:createServer(lexicons(),{validateResponse:true,payload:{blobLimit:MAX_WASM_BYTES,jsonLimit:16384}}),database,options};}
export function method(server,nsid,handler){
 const config={handler:async request=>handler(request)};
 if(nsid===PUBLISH)config.auth=async({req})=>{
  const token=/^Bearer ([^ ]+)$/i.exec(req.headers.authorization ?? '')?.[1];if(!token)throw new AuthRequiredError('A publisher service-auth token is required');
  const claims=await verifyJwt(token,process.env.SERVICE_DID ?? 'did:web:api.fluentci.io',PUBLISH,(issuer,refresh)=>(server.options.resolveSigningKey ?? identity.did.resolveAtprotoKey.bind(identity.did))(issuer,refresh));
  if(claims.iss.includes('#'))throw new AuthRequiredError('Expected an account DID');return {credentials:{did:claims.iss}};
 };
 server.xrpc.method(nsid,config);
}
export const param=(request,key)=>request.params[key] ?? '';
export const limit=request=>request.params.limit ?? 20;
export const json=body=>({encoding:'application/json',body:JSON.parse(body)});
export async function resolveAuthor(author){if(!author||author.startsWith('did:'))return author;const did=await identity.handle.resolve(author);if(!did)throw new InvalidRequestError('Author handle could not be resolved');return did;}
export async function upload(server,request){
 const body=request.input?.body;
 const chunks=[];let size=0;
 if(body?.[Symbol.asyncIterator]){
  for await(const chunk of body){
   const bytes=Buffer.from(chunk);size+=bytes.length;
   if(size>MAX_WASM_BYTES)throw new InvalidRequestError('Upload a valid Wasm module (maximum 64 MiB)','InvalidWasm');
   chunks.push(bytes);
  }
 }else if(body){chunks.push(Buffer.from(body));}
 const bytes=Buffer.concat(chunks);
 if(!bytes.length||bytes.length>MAX_WASM_BYTES||!WebAssembly.validate(bytes))throw new InvalidRequestError('Upload a valid Wasm module (maximum 64 MiB)','InvalidWasm');
 const author=request.auth.credentials.did;const digest=createHash('sha256').update(bytes).digest('hex');
 const key=`plugins/${createHash('sha256').update(author).digest('hex')}/${digest}.wasm`;
 const bucket=process.env.S3_BUCKET;const publicOrigin=process.env.S3_PUBLIC_URL;
 if(!bucket||!publicOrigin)throw new XRPCError(503,'StorageUnavailable','Configure S3_BUCKET and S3_PUBLIC_URL');
 const base=new URL(publicOrigin.endsWith('/')?publicOrigin:publicOrigin+'/');
 if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw new XRPCError(503,'StorageUnavailable','Invalid public storage URL');
 const url=new URL(key,base).href;
 server.s3 ??= new S3Client({region:process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1',endpoint:process.env.S3_ENDPOINT || undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true'});
 try{await server.s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:'application/wasm',CacheControl:'public, max-age=31536000, immutable',ChecksumSHA256:createHash('sha256').update(bytes).digest('base64')}));}
 catch{throw new XRPCError(503,'StorageUnavailable','Could not store the Wasm artifact');}
 return {encoding:'application/json',body:{url,sha256:digest,size:bytes.length}};
}
export function app(server){const app=express();app.disable('x-powered-by');app.get('/health',(_req,res)=>res.json({status:'ok'}));app.use(server.xrpc.router);return app;}
export function listen(server,database,stopIndexer){
 const port=Number(process.env.PORT ?? 3001);const http=app(server).listen(port,process.env.HOST ?? '127.0.0.1',()=>console.info(`FluentCI XRPC listening on ${port}`));
 const stop=()=>{stopIndexer();http.close(async()=>{await stopIndexer.drain?.();server.s3?.destroy();await close(database);});};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
