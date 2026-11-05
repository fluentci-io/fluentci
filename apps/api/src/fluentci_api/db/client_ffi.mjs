import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {root,source} from '../config_ffi.mjs';
export async function open(options={}) {
 const directory=root();const url=options.url ?? process.env.DATABASE_URL ?? `file:${resolve(directory,'data/registry.sqlite')}`;
 if(url.startsWith('file:')&&!url.includes(':memory:'))mkdirSync(dirname(resolve(url.slice(5))),{recursive:true});
 const client=createClient({url});const db=drizzle(client);
 await client.execute('PRAGMA foreign_keys = ON');await client.execute('PRAGMA busy_timeout = 10000');
 if(!url.includes(':memory:'))await client.execute('PRAGMA journal_mode = WAL');
 await migrate(db,{migrationsFolder:options.migrationsFolder ?? resolve(directory,'drizzle')});
 return {client,db,source:options.source ?? source()};
}
export async function close(connection){connection.client.close();}

export const sourceOf=connection=>connection.source;
