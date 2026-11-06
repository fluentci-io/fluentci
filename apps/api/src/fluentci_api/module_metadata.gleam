//// Serialization for optional module classification lists stored as JSON text.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json

pub fn decode_wire(value: Dynamic) -> List(String) {
  let assert Ok(values) = decode.run(value, decode.list(decode.string))
  values
}

pub fn from_string(value: String) -> List(String) {
  let assert Ok(values) = json.parse(value, decode.list(decode.string))
  values
}

pub fn to_string(values: List(String)) -> String {
  json.array(values, json.string) |> json.to_string
}
