import ci/common as c
import ci/native
import gleam/dict
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/result
import gleam/string

pub type Variable {
  Variable(name: String, value: String)
}

pub type Setup {
  Setup(bin: String, variables: List(Variable))
}

fn variable_decoder() {
  use name <- decode.field("name", decode.string)
  use value <- decode.field("value", decode.string)
  decode.success(Variable(name, value))
}

fn setup_decoder() {
  use snake <- decode.optional_field("bin-dir", "", decode.string)
  use camel <- decode.optional_field("binDir", "", decode.string)
  use variables <- decode.field("environment", decode.list(variable_decoder()))
  decode.success(Setup(
    case snake {
      "" -> camel
      _ -> snake
    },
    variables,
  ))
}

pub fn parse(text: String) -> Result(Setup, String) {
  json.parse(text, setup_decoder())
  |> result.map_error(fn(_) {
    "Setup module did not return a typed environment result"
  })
}

// Preserve streaming diagnostics; buffer only a possible final typed JSON record.
fn read_result(
  pending: String,
  found: Result(Setup, String),
) -> Result(Setup, String) {
  case native.read_line() {
    Error(_) -> {
      let _ = native.stderr(pending)
      found
    }
    Ok(line) ->
      case found {
        Ok(value) ->
          case string.trim(line) {
            "" -> read_result("", Ok(value))
            _ -> Error("Setup result must be the final output")
          }
        Error(_) -> {
          let candidate = case string.starts_with(line, "{") {
            True -> {
              let _ = native.stderr(pending)
              line
            }
            False -> pending <> line
          }
          case parse(candidate) {
            Ok(value) -> read_result("", Ok(value))
            Error(_) ->
              case
                string.starts_with(string.trim_start(candidate), "{")
                && string.length(candidate) <= 1_048_576
              {
                True -> read_result(candidate, found)
                False -> {
                  let _ = native.stderr(candidate)
                  read_result("", found)
                }
              }
          }
        }
      }
  }
}

pub fn validate(
  setup: Setup,
  current_path: String,
) -> Result(#(List(String), List(Variable)), String) {
  use _ <- result.try(c.require(c.path(setup.bin), "Invalid setup bin-dir"))
  use _ <- result.try(
    c.all(setup.variables, fn(item) {
      let name = item.name
      use _ <- result.try(c.require(
        c.ascii(
          name,
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_",
        )
          && !c.ascii(string.slice(name, 0, 1), "0123456789"),
        "Invalid setup variable name",
      ))
      use _ <- result.try(c.require(
        !string.contains(item.value, "\u{0}"),
        "NUL in setup value",
      ))
      c.require(
        !string.starts_with(name, "GITHUB_")
          && !string.starts_with(name, "RUNNER_")
          && !list.contains(
          ["NODE_OPTIONS", "BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS"],
          name,
        ),
        "Reserved setup variable",
      )
    }),
  )
  let names = list.map(setup.variables, fn(item) { item.name })
  use _ <- result.try(c.require(
    list.length(names) == list.length(list.unique(names)),
    "Duplicate setup variable",
  ))
  let inherited = string.split(current_path, ":")
  let additions =
    list.filter_map(setup.variables, fn(item) {
      case item.name {
        "PATH" -> Ok(item.value)
        _ -> Error(Nil)
      }
    })
    |> string.join(":")
    |> string.split(":")
    |> list.filter(fn(p) { p != "" && !list.contains(inherited, p) })
  use _ <- result.try(
    c.all(additions, fn(p) { c.require(c.path(p), "Invalid setup PATH entry") }),
  )
  Ok(#(
    list.unique([setup.bin, ..additions]),
    list.filter(setup.variables, fn(item) { item.name != "PATH" }),
  ))
}

fn delimiter(value: String) -> String {
  let key = "fluentci_" <> native.nonce()
  case string.contains(value, key) {
    True -> delimiter(value)
    False -> key
  }
}

pub fn github(setup: Setup) -> Result(Nil, String) {
  use validated <- result.try(validate(setup, native.env("PATH")))
  let #(paths, variables) = validated
  use path_file <- result.try(c.env("GITHUB_PATH"))
  use env_file <- result.try(c.env("GITHUB_ENV"))
  let values =
    list.map(variables, fn(item) {
      let key = delimiter(item.value)
      item.name <> "<<" <> key <> "\n" <> item.value <> "\n" <> key <> "\n"
    })
    |> string.join("")
  use _ <- result.try(native.append(
    path_file,
    string.join(list.reverse(paths), "\n") <> "\n",
  ))
  native.append(env_file, values)
}

fn quote(value: String) -> String {
  "'" <> string.replace(value, "'", "'\\''") <> "'"
}

pub fn spindle_to(
  setup: Setup,
  state: String,
  current_path: String,
) -> Result(Nil, String) {
  use validated <- result.try(validate(setup, current_path))
  let #(paths, variables) = validated
  use _ <- result.try(native.mkdir(state))
  use _ <- result.try(native.chmod(state, 448))
  let manifest = state <> "/environment.json"
  let prior = case native.regular(manifest) {
    False -> Ok(dict.new())
    True -> {
      use value <- result.try(c.text(manifest))
      json.parse(value, decode.dict(decode.string, decode.string))
      |> result.map_error(fn(_) { "Invalid persisted setup environment" })
    }
  }
  use previous <- result.try(prior)
  let merged =
    list.fold(variables, previous, fn(values, item) {
      dict.insert(values, item.name, item.value)
    })
    |> dict.insert(
      "PATH",
      string.join(
        list.unique(list.append(paths, string.split(current_path, ":"))),
        ":",
      ),
    )
  use _ <- result.try(
    c.all(dict.to_list(merged), fn(pair) {
      let #(name, value) = pair
      use _ <- result.try(c.require(
        !string.starts_with(name, "TANGLED_")
          && !string.starts_with(name, "SPINDLE_")
          && !string.starts_with(name, "FLUENTCI_SPINDLE_"),
        "Reserved Spindle variable",
      ))
      validate(Setup("/bin", [Variable(name, value)]), "")
      |> result.map(fn(_) { Nil })
    }),
  )
  let exports =
    dict.to_list(merged)
    |> list.map(fn(pair) {
      let #(name, value) = pair
      "export " <> name <> "=" <> quote(value) <> "\n"
    })
    |> string.join("")
  use _ <- result.try(
    c.all(
      [
        #(
          manifest,
          json.object(
            dict.to_list(merged)
            |> list.map(fn(pair) { #(pair.0, json.string(pair.1)) }),
          )
            |> json.to_string,
        ),
        #(
          state <> "/environment.sh",
          "# Generated by Gleam CI helpers\n" <> exports,
        ),
      ],
      fn(pair) {
        let temporary = pair.0 <> "." <> native.nonce()
        use _ <- result.try(c.write(temporary, pair.1))
        use _ <- result.try(native.chmod(temporary, 384))
        native.rename(temporary, pair.0)
      },
    ),
  )
  Ok(Nil)
}

pub fn export(spindle_mode: Bool) -> Result(Nil, String) {
  use value <- result.try(read_result(
    "",
    Error("Setup module did not return a typed environment result"),
  ))
  case spindle_mode {
    True ->
      spindle_to(value, native.cwd() <> "/.tangled-state", native.env("PATH"))
    False -> github(value)
  }
}
