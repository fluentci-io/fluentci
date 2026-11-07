// Generic Drizzle bridge. Tables and application queries are defined in Gleam.
import * as d from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  alias,
  QueryBuilder,
} from 'drizzle-orm/sqlite-core';
import { toList } from '../../gleam.mjs';
export const identity = (value) => value;
export const nullValue = () => null;
const definition = (name, kind, nullable = false, primary = false) => ({
  name,
  kind,
  nullable,
  primary,
});
export const textColumn = (name, nullable, primary) => definition(name, 'text', nullable, primary);
export const integerColumn = (name, nullable, primary) =>
  definition(name, 'integer', nullable, primary);
export const booleanColumn = (name) => definition(name, 'boolean');
export const columnDefault = (column, value) => ({ ...column, defaultValue: value });
const tables = new Map();
export function table(name, definitions, indexes) {
  const defs = definitions.toArray();
  const indexDefs = indexes.toArray();
  const signature = JSON.stringify([defs, indexDefs]);
  const existing = tables.get(name);
  if (existing) {
    if (existing.signature !== signature) throw Error(`Conflicting table definitions: ${name}`);
    return existing.table;
  }
  const columns = Object.fromEntries(
    defs.map((def) => {
      let column =
        def.kind === 'text'
          ? text(def.name)
          : integer(def.name, def.kind === 'boolean' ? { mode: 'boolean' } : undefined);
      if (!def.nullable) column = column.notNull();
      if (def.primary) column = column.primaryKey();
      if (Object.hasOwn(def, 'defaultValue')) column = column.default(def.defaultValue);
      return [def.name, column];
    }),
  );
  const value = sqliteTable(name, columns, (table) =>
    indexDefs.map((def) =>
      (def.unique ? uniqueIndex : index)(def.name).on(...def.columns.map((name) => table[name])),
    ),
  );
  tables.set(name, { signature, table: value });
  return value;
}
const indexDefinition = (name, columns, unique) => ({ name, columns: columns.toArray(), unique });
export { indexDefinition as index };
export const column = (table, name) => {
  const value = d.getTableColumns(table)[name];
  if (!value) throw Error(`Unknown column ${name}`);
  return value;
};
const from = (table) => ({ kind: 'select', table, joins: [] });
export { from };
export const where = (query, where) => ({ ...query, where });
export const limit = (query, limit) => ({ ...query, limit });
export const join = (query, table, on, inner) => ({
  ...query,
  joins: [...query.joins, { table, on, inner }],
});
export const compare = (column, op, value) => d[op](column, value);
export const eqColumns = d.eq;
export const isNull = d.isNull;
export const combine = (conditions, all) => {
  const items = conditions.toArray();
  return items.length ? (all ? d.and : d.or)(...items) : all ? d.sql`true` : d.sql`false`;
};
export const matches = (table, query) => d.sql`${table} MATCH ${query}`;
export const orderExpression = (column, descending) => (descending ? d.desc : d.asc)(column);
export const order = (query, orders) => ({ ...query, orders: orders.toArray() });
export const assignment = (column, value) => ({ column, value });
const values = (assignments) =>
  Object.fromEntries(assignments.toArray().map(({ column, value }) => [column.name, value]));
export const insert = (table, assignments) => ({
  kind: 'insert',
  table,
  values: values(assignments),
});
export const conflictNothing = (query) => ({ ...query, conflict: { nothing: true } });
export const conflictUpdate = (query, target, assignments, setWhere) => ({
  ...query,
  conflict: { target, set: values(assignments), setWhere },
});
function selection(connection, q) {
  let query = connection.select(d.getTableColumns(q.table)).from(q.table).$dynamic();
  for (const join of q.joins)
    query = query[join.inner ? 'innerJoin' : 'leftJoin'](join.table, join.on);
  if (q.where) query = query.where(q.where);
  if (q.orders) query = query.orderBy(...q.orders);
  if (q.limit !== undefined) query = query.limit(q.limit);
  return query;
}
export { alias };
export const compareColumns = (left, right, operator) => d[operator](left, right);
export const notExists = (query) => d.notExists(selection(new QueryBuilder(), query));
export async function countRows(connection, query) {
  const [row] = await connection.db
    .select({ count: d.count() })
    .from(selection(connection.db, query).as('counted_rows'));
  return row.count;
}
export async function execute(connection, q) {
  let query;
  if (q.kind === 'select') {
    query = selection(connection.db, q);
  } else if (q.kind === 'update') {
    query = connection.db.update(q.table).set(q.values).where(q.where).returning();
  } else {
    query = connection.db.insert(q.table).values(q.values);
    if (q.conflict?.nothing) query = query.onConflictDoNothing();
    else if (q.conflict) query = query.onConflictDoUpdate(q.conflict);
    query = query.returning();
  }
  return toList(await query);
}
// Serialize writers sharing a native connection, including HTTP and Jetstream writes.
// Separate connections remain coordinated by SQLite's write transaction/timeout.
const transactionTails = new WeakMap();
export function transaction(connection, run) {
  const execute = () =>
    connection.db.transaction((tx) => run({ ...connection, db: tx, inTransaction: true }));
  if (connection.inTransaction) return execute();
  const key = connection.client;
  const result = (transactionTails.get(key) ?? Promise.resolve()).then(execute);
  transactionTails.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export const notCondition = d.not;
export const jsonContains = (column, value) =>
  d.sql`EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${value})`;

export const incrementAssignment = (column, amount) => ({
  column,
  value: d.sql`${column} + ${amount}`,
});
export const update = (table, assignments) => ({
  kind: 'update',
  table,
  values: values(assignments),
});
export const conflictUpdateColumns = (query, targets, assignments, setWhere) => ({
  ...query,
  conflict: { target: targets.toArray(), set: values(assignments), setWhere },
});
