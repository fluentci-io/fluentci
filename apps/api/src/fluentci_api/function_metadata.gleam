//// SDK-neutral function metadata serialization. SQL remains in db/client.

import fluentci_api/lexicon/models.{
  type PluginArgument, type PluginFunction, PluginArgument, PluginFunction,
}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/option.{None}

fn argument_decoder() -> decode.Decoder(PluginArgument) {
  use name <- decode.field("name", decode.string)
  use type_ <- decode.field("type", decode.string)
  use description <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use required <- decode.optional_field(
    "required",
    None,
    decode.optional(decode.bool),
  )
  decode.success(PluginArgument(name, type_, description, required))
}

fn function_decoder() -> decode.Decoder(PluginFunction) {
  use name <- decode.field("name", decode.string)
  use description <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use args <- decode.optional_field(
    "args",
    None,
    decode.optional(decode.list(argument_decoder())),
  )
  use returns <- decode.optional_field(
    "returnType",
    None,
    decode.optional(decode.string),
  )
  use params <- decode.field("wasmParams", decode.list(decode.string))
  use results <- decode.field("wasmResults", decode.list(decode.string))
  use input_format <- decode.optional_field(
    "inputFormat",
    None,
    decode.optional(decode.string),
  )
  decode.success(PluginFunction(
    name,
    description,
    args,
    returns,
    params,
    results,
    input_format,
  ))
}

pub fn decode_wire(value: Dynamic) -> List(PluginFunction) {
  let assert Ok(functions) = decode.run(value, decode.list(function_decoder()))
  functions
}

pub fn from_string(value: String) -> List(PluginFunction) {
  let assert Ok(functions) = json.parse(value, decode.list(function_decoder()))
  functions
}

pub fn to_string(functions: List(PluginFunction)) -> String {
  json.array(functions, models.encode_plugin_function) |> json.to_string
}
