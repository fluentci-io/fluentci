//// Typed SQLite query construction backed by Drizzle's JavaScript runtime.

import fluentci_api/db/connection.{type Db}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode.{type Decoder}
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}

pub type Raw

pub type Condition

pub type Order

pub type Assignment

pub type ColumnDefinition

pub type IndexDefinition

pub opaque type Codec(a) {
  Codec(encode: fn(a) -> Dynamic, decoder: Decoder(a))
}

pub opaque type Table(a) {
  Table(raw: Raw, decoder: Decoder(a))
}

pub opaque type Expression(a) {
  Expression(raw: Raw, codec: Codec(a))
}

pub opaque type Query(a) {
  Query(raw: Raw, decoder: Decoder(a))
}

@external(javascript, "./orm_ffi.mjs", "identity")
fn dynamic(value: a) -> Dynamic

@external(javascript, "./orm_ffi.mjs", "nullValue")
fn null_value() -> Dynamic

pub fn text() -> Codec(String) {
  Codec(dynamic, decode.string)
}

pub fn integer() -> Codec(Int) {
  Codec(dynamic, decode.int)
}

pub fn boolean() -> Codec(Bool) {
  Codec(dynamic, decode.bool)
}

pub fn optional(codec: Codec(a)) -> Codec(Option(a)) {
  Codec(
    fn(value) {
      case value {
        None -> null_value()
        Some(value) -> codec.encode(value)
      }
    },
    decode.optional(codec.decoder),
  )
}

@external(javascript, "./orm_ffi.mjs", "textColumn")
pub fn text_column(
  name: String,
  nullable: Bool,
  primary: Bool,
) -> ColumnDefinition

@external(javascript, "./orm_ffi.mjs", "integerColumn")
pub fn integer_column(
  name: String,
  nullable: Bool,
  primary: Bool,
) -> ColumnDefinition

@external(javascript, "./orm_ffi.mjs", "booleanColumn")
pub fn boolean_column(name: String) -> ColumnDefinition

@external(javascript, "./orm_ffi.mjs", "columnDefault")
pub fn column_default(
  definition: ColumnDefinition,
  value: a,
) -> ColumnDefinition

pub fn table(
  name: String,
  columns: List(ColumnDefinition),
  indexes: List(IndexDefinition),
  decoder: Decoder(a),
) -> Table(a) {
  Table(table_ffi(name, columns, indexes), decoder)
}

@external(javascript, "./orm_ffi.mjs", "table")
fn table_ffi(
  name: String,
  columns: List(ColumnDefinition),
  indexes: List(IndexDefinition),
) -> Raw

@external(javascript, "./orm_ffi.mjs", "index")
pub fn index(
  name: String,
  columns: List(String),
  unique: Bool,
) -> IndexDefinition

pub fn column(
  table: Table(a),
  property: String,
  codec: Codec(b),
) -> Expression(b) {
  Expression(column_ffi(table.raw, property), codec)
}

@external(javascript, "./orm_ffi.mjs", "column")
fn column_ffi(table: Raw, property: String) -> Raw

pub fn from(table: Table(a)) -> Query(a) {
  Query(from_ffi(table.raw), table.decoder)
}

@external(javascript, "./orm_ffi.mjs", "from")
fn from_ffi(table: Raw) -> Raw

pub fn where(query: Query(a), condition: Condition) -> Query(a) {
  Query(where_ffi(query.raw, condition), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "where")
fn where_ffi(query: Raw, condition: Condition) -> Raw

pub fn limit(query: Query(a), count: Int) -> Query(a) {
  Query(limit_ffi(query.raw, count), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "limit")
fn limit_ffi(query: Raw, count: Int) -> Raw

pub fn left_join(query: Query(a), table: Table(b), on: Condition) -> Query(a) {
  Query(join_ffi(query.raw, table.raw, on, False), query.decoder)
}

pub fn inner_join(query: Query(a), table: Table(b), on: Condition) -> Query(a) {
  Query(join_ffi(query.raw, table.raw, on, True), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "join")
fn join_ffi(query: Raw, table: Raw, on: Condition, inner: Bool) -> Raw

pub fn eq(expression: Expression(a), value: a) -> Condition {
  compare(expression.raw, "eq", expression.codec.encode(value))
}

pub fn lt(expression: Expression(a), value: a) -> Condition {
  compare(expression.raw, "lt", expression.codec.encode(value))
}

pub fn gt(expression: Expression(a), value: a) -> Condition {
  compare(expression.raw, "gt", expression.codec.encode(value))
}

@external(javascript, "./orm_ffi.mjs", "compare")
fn compare(expression: Raw, operator: String, value: Dynamic) -> Condition

pub fn eq_columns(left: Expression(a), right: Expression(a)) -> Condition {
  compare_columns(left.raw, right.raw)
}

@external(javascript, "./orm_ffi.mjs", "eqColumns")
fn compare_columns(left: Raw, right: Raw) -> Condition

pub fn is_null(expression: Expression(a)) -> Condition {
  null_ffi(expression.raw)
}

@external(javascript, "./orm_ffi.mjs", "isNull")
fn null_ffi(expression: Raw) -> Condition

pub fn and(conditions: List(Condition)) -> Condition {
  combine(conditions, True)
}

pub fn or(conditions: List(Condition)) -> Condition {
  combine(conditions, False)
}

@external(javascript, "./orm_ffi.mjs", "combine")
fn combine(conditions: List(Condition), all: Bool) -> Condition

pub fn matches(table: Table(a), query: String) -> Condition {
  matches_ffi(table.raw, query)
}

@external(javascript, "./orm_ffi.mjs", "matches")
fn matches_ffi(table: Raw, query: String) -> Condition

pub fn asc(expression: Expression(a)) -> Order {
  order_expression(expression.raw, False)
}

pub fn desc(expression: Expression(a)) -> Order {
  order_expression(expression.raw, True)
}

@external(javascript, "./orm_ffi.mjs", "orderExpression")
fn order_expression(expression: Raw, descending: Bool) -> Order

pub fn order_by(query: Query(a), orders: List(Order)) -> Query(a) {
  Query(order_ffi(query.raw, orders), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "order")
fn order_ffi(query: Raw, orders: List(Order)) -> Raw

pub fn set(expression: Expression(a), value: a) -> Assignment {
  assignment(expression.raw, expression.codec.encode(value))
}

@external(javascript, "./orm_ffi.mjs", "assignment")
fn assignment(expression: Raw, value: Dynamic) -> Assignment

pub fn insert(table: Table(a), assignments: List(Assignment)) -> Query(a) {
  Query(insert_ffi(table.raw, assignments), table.decoder)
}

@external(javascript, "./orm_ffi.mjs", "insert")
fn insert_ffi(table: Raw, assignments: List(Assignment)) -> Raw

pub fn on_conflict_do_nothing(query: Query(a)) -> Query(a) {
  Query(conflict_nothing(query.raw), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "conflictNothing")
fn conflict_nothing(query: Raw) -> Raw

pub fn on_conflict_do_update(
  query: Query(a),
  target: Expression(b),
  assignments: List(Assignment),
  condition: Condition,
) -> Query(a) {
  Query(
    conflict_update(query.raw, target.raw, assignments, condition),
    query.decoder,
  )
}

@external(javascript, "./orm_ffi.mjs", "conflictUpdate")
fn conflict_update(
  query: Raw,
  target: Raw,
  assignments: List(Assignment),
  condition: Condition,
) -> Raw

pub fn all(db: Db, query: Query(a)) -> Promise(List(a)) {
  use rows <- promise.map(execute(db, query.raw))
  list.map(rows, fn(row) {
    let assert Ok(value) = decode.run(row, query.decoder)
    value
  })
}

@external(javascript, "./orm_ffi.mjs", "execute")
fn execute(db: Db, query: Raw) -> Promise(List(Dynamic))

@external(javascript, "./orm_ffi.mjs", "transaction")
pub fn transaction(db: Db, run: fn(Db) -> Promise(a)) -> Promise(a)
