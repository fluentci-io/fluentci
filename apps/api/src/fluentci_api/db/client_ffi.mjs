import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { drizzle as proxyDrizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate as proxyMigrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { root, source } from '../config_ffi.mjs';
export async function open(options = {}) {
  const directory = root();
  const url =
    options.url ?? process.env.DATABASE_URL ?? `file:${resolve(directory, 'data/registry.sqlite')}`;
  if (url.startsWith('file:') && !url.includes(':memory:'))
    mkdirSync(dirname(resolve(url.slice(5))), { recursive: true });
  if (url.startsWith('file:')) return openLocal(url, directory, options);
  const client = createClient({ url });
  const db = drizzle(client);
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute('PRAGMA busy_timeout = 10000');
  if (!url.includes(':memory:')) await client.execute('PRAGMA journal_mode = WAL');
  await migrate(db, {
    migrationsFolder: options.migrationsFolder ?? resolve(directory, 'drizzle'),
  });
  return { client, db, source: options.source ?? source() };
}
export async function close(connection) {
  connection.client.close();
}

export const sourceOf = (connection) => connection.source;

// Local transactions retain one native connection and its PRAGMAs. The libsql
// local adapter detaches its connection on every transaction, losing busy_timeout
// and leaving native transaction handles for GC under a sustained replay.
async function openLocal(url, directory, options) {
  const path = url.includes(':memory:') ? ':memory:' : fileURLToPath(new URL(url));
  const native = new DatabaseSync(path);
  let closed = false;
  const client = {
    execute: async (input) => {
      const sql = typeof input === 'string' ? input : input.sql;
      const params = typeof input === 'string' ? [] : (input.args ?? []);
      const statement = native.prepare(sql);
      if (statement.columns().length) return { rows: statement.all(...params) };
      return { rows: [], ...statement.run(...params) };
    },
    close: () => {
      if (!closed) {
        closed = true;
        native.close();
      }
    },
  };
  const db = proxyDrizzle(async (sql, params, method) => {
    const statement = native.prepare(sql);
    if (method === 'run') return { rows: [], ...statement.run(...params) };
    statement.setReturnArrays(true);
    return { rows: method === 'get' ? statement.get(...params) : statement.all(...params) };
  });
  try {
    native.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
    if (path !== ':memory:') native.exec('PRAGMA journal_mode = WAL;');
    await proxyMigrate(
      db,
      async (queries) => {
        native.exec('BEGIN IMMEDIATE');
        try {
          for (const query of queries) native.exec(query);
          native.exec('COMMIT');
        } catch (error) {
          native.exec('ROLLBACK');
          throw error;
        }
      },
      { migrationsFolder: options.migrationsFolder ?? resolve(directory, 'drizzle') },
    );
    return { client, db, source: options.source ?? source() };
  } catch (error) {
    client.close();
    throw error;
  }
}
