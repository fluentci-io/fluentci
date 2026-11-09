import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { compareVersions } from './query_helpers.mjs';
import { root, source } from '../config_ffi.mjs';

export async function open(options = {}) {
  const directory = root();
  const url =
    options.url ?? process.env.DATABASE_URL ?? `file:${resolve(directory, 'data/registry.sqlite')}`;
  if (!url.startsWith('file:')) throw Error('DATABASE_URL must identify a local SQLite file');
  const path =
    url === 'file::memory:'
      ? ':memory:'
      : url.startsWith('file:/')
        ? fileURLToPath(new URL(url))
        : resolve(directory, url.slice(5));
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const native = new DatabaseSync(path);
  native.function('semver_compare', { deterministic: true }, compareVersions);
  let closed = false;
  // Keep raw execution available for operational checks and test fixtures.
  // Application schemas and queries remain in the Gleam Drizzle bindings.
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
  const db = drizzle({ client: native });
  try {
    native.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
    if (path !== ':memory:') native.exec('PRAGMA journal_mode = WAL;');
    migrate(db, { migrationsFolder: options.migrationsFolder ?? resolve(directory, 'drizzle') });
    // The native driver's transaction callback is synchronous. Gleam callbacks
    // return promises, so explicitly keep BEGIN open until every awaited query
    // completes; the shared ORM queue excludes unrelated reads and writers.
    const transaction = async (run) => {
      native.exec('BEGIN IMMEDIATE');
      try {
        const result = await run(db);
        native.exec('COMMIT');
        return result;
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    };
    return { client, db, transaction, source: options.source ?? source() };
  } catch (error) {
    client.close();
    throw error;
  }
}

export async function close(connection) {
  connection.client.close();
}

export const sourceOf = (connection) => connection.source;
