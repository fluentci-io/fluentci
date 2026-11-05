import {RegistryPackageView as Package,RegistryListPackagesOutput as Page} from '../lexicon/models.mjs';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {and,or,eq,lt,gt,asc,desc,sql,isNull} from 'drizzle-orm';
import {InvalidRequestError} from '@atproto/xrpc-server';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import semver from 'semver';
import {Upsert,Delete,Account,Checkpoint} from '../model.mjs';
import {Some,None} from '../../../gleam_stdlib/gleam/option.mjs';
import {toList} from '../../gleam.mjs';
import * as schema from '../schema/registry.mjs';
import {root,source} from '../config_ffi.mjs';
const {records,checkpoints,accounts}=schema;
const present=p=>new Package(p.name,p.description,p.version,p.publishedAt,p.author,p.license,p.url,p.sha256,p.size,p.uri,p.cid);
export async function open(options={}) {
 const directory=root();const url=options.url ?? process.env.DATABASE_URL ?? `file:${resolve(directory,'data/registry.sqlite')}`;
 if(url.startsWith('file:')&&!url.includes(':memory:'))mkdirSync(dirname(resolve(url.slice(5))),{recursive:true});
 const client=createClient({url});const db=drizzle(client,{schema});
 await client.execute('PRAGMA foreign_keys = ON');await client.execute('PRAGMA busy_timeout = 10000');
 if(!url.includes(':memory:'))await client.execute('PRAGMA journal_mode = WAL');
 await migrate(db,{migrationsFolder:resolve(directory,'drizzle')});
 return {client,db,source:options.source ?? source()};
}
export async function close(connection){connection.client.close();}
export async function cursor(connection){return (await connection.db.select().from(checkpoints).where(eq(checkpoints.source,connection.source)))[0]?.timeUs ?? 0;}
const visible=and(eq(records.deleted,false),or(isNull(accounts.active),eq(accounts.active,true)));
const escapeLike=s=>s.replace(/[\\%_]/g,v=>`\\${v}`);
const queryHash=(q,a)=>createHash('sha256').update(JSON.stringify([q,a])).digest('hex');
export async function listPackages(connection,query,author,limit,cursorValue){
 const conditions=[visible];if(author)conditions.push(eq(records.author,author));
 if(query){const value=`%${escapeLike(query)}%`;conditions.push(or(sql`${records.name} LIKE ${value} ESCAPE '\\'`,sql`${records.description} LIKE ${value} ESCAPE '\\'`));}
 const filter=queryHash(query,author);
 if(cursorValue){let value;try{value=JSON.parse(Buffer.from(cursorValue,'base64url').toString());}catch{throw new InvalidRequestError('Invalid pagination cursor','InvalidCursor');}
  if(value?.filter!==filter||typeof value.time!=='string'||typeof value.uri!=='string'||!value.uri.startsWith('at://'))throw new InvalidRequestError('Cursor does not match this query','InvalidCursor');
  conditions.push(or(lt(records.publishedAt,value.time),and(eq(records.publishedAt,value.time),gt(records.uri,value.uri))));}
 const rows=await connection.db.select({record:records}).from(records).leftJoin(accounts,eq(accounts.did,records.author)).where(and(...conditions)).orderBy(desc(records.publishedAt),asc(records.uri)).limit(limit+1);
 const page=rows.slice(0,limit).map(r=>r.record);const last=page.at(-1);
 const next=rows.length>limit?new Some(Buffer.from(JSON.stringify({time:last.publishedAt,uri:last.uri,filter})).toString('base64url')):new None();
 return new Page(toList(page.map(present)),next);
}
export async function getPackage(connection,name,version,author){
 const conditions=[visible,eq(records.name,name)];if(author)conditions.push(eq(records.author,author));if(version)conditions.push(eq(records.version,version));
 const rows=await connection.db.select({record:records}).from(records).leftJoin(accounts,eq(accounts.did,records.author)).where(and(...conditions)).limit(1001);
 if(!rows.length)throw new InvalidRequestError('Package not found','PackageNotFound');
 if(new Set(rows.map(r=>r.record.author)).size>1)throw new InvalidRequestError('Specify author to disambiguate packages','AmbiguousPackage');
 if(rows.length>1000)throw new InvalidRequestError('Specify an explicit version for this package');
 const versions=rows.map(r=>r.record);const stable=versions.filter(r=>!semver.prerelease(r.version));
 return present((stable.length?stable:versions).sort((a,b)=>semver.rcompare(a.version,b.version))[0]);
}
export async function applyEvent(connection,event){
 const time=event.time_us;if(!Number.isSafeInteger(time)||time<0)throw new Error('Invalid Jetstream timestamp');
 await connection.db.transaction(async tx=>{
  if(event instanceof Upsert){const p=event.package;const value={uri:p.uri,cid:p.cid,name:p.name,description:p.description,version:p.version,publishedAt:p.published_at,author:p.author,license:p.license,url:p.url,sha256:p.sha256,size:p.size,deleted:false,eventTime:time};
   await tx.insert(records).values(value).onConflictDoUpdate({target:records.uri,set:value,setWhere:lt(records.eventTime,time)});
  }else if(event instanceof Delete){const value={uri:event.uri,author:event.author,deleted:true,eventTime:time};await tx.insert(records).values(value).onConflictDoUpdate({target:records.uri,set:{deleted:true,eventTime:time},setWhere:lt(records.eventTime,time)});
  }else if(event instanceof Account){const value={did:event.author,active:event.active,eventTime:time};await tx.insert(accounts).values(value).onConflictDoUpdate({target:accounts.did,set:value,setWhere:lt(accounts.eventTime,time)});
  }else if(!(event instanceof Checkpoint))throw new Error('Unknown Jetstream event');
  await tx.insert(checkpoints).values({source:connection.source,timeUs:time}).onConflictDoUpdate({target:checkpoints.source,set:{timeUs:time},setWhere:lt(checkpoints.timeUs,time)});
 });
}
