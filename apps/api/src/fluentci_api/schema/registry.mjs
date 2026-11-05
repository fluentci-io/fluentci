import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('plugin_records', {
  uri: text('uri').primaryKey(), cid: text('cid'), author: text('author').notNull(),
  name: text('name'), description: text('description'), version: text('version'),
  publishedAt: text('published_at'), license: text('license'), url: text('url'),
  sha256: text('sha256'), size: integer('size'), deleted: integer('deleted', {mode:'boolean'}).notNull().default(false),
  eventTime: integer('event_time').notNull(),
}, t => [index('plugin_name_author').on(t.name,t.author),index('plugin_page').on(t.publishedAt,t.uri)]);
export const checkpoints=sqliteTable('checkpoints',{source:text('source').primaryKey(),timeUs:integer('time_us').notNull()});
export const accounts=sqliteTable('accounts',{did:text('did').primaryKey(),active:integer('active',{mode:'boolean'}).notNull(),eventTime:integer('event_time').notNull()});
