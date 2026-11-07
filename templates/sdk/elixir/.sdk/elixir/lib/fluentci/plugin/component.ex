defmodule FluentCI.Plugin.Component do
  @moduledoc "Typed WIT jobs over the same DSL implementation as Extism guests."

  def source(exports, docs \\ %{}) do
    metadata = FluentCI.Plugin.Codegen.metadata(exports, docs)

    functions =
      Enum.map(exports, fn {name, value} ->
        definition = Enum.find(metadata, &(&1.name == Atom.to_string(name)))

        unless definition[:inputFormat] == "json",
          do:
            raise(
              ArgumentError,
              "component exports require named arguments; replace input() with argument(name, type)"
            )

        fields = definition.args
        record = "Args" <> Macro.camelize(Atom.to_string(name))

        declarations =
          Enum.map_join(fields, "\n", fn field ->
            doc =
              if field[:description],
                do: "/// " <> String.replace(field.description, "\n", "\n/// ") <> "\n",
                else: ""

            doc <> "pub #{identifier(field.name)}: #{rust_type(field.type)},"
          end)

        record_source =
          if fields == [], do: "", else: "pub struct #{record} {\n#{declarations}\n}\n"

        parameters = if fields == [], do: "", else: "args: #{record}"

        input =
          Enum.map_join(fields, ",", fn field ->
            "#{JSON.encode!(field.name)}: args.#{identifier(field.name)}"
          end)

        doc =
          if definition[:description],
            do: "/// " <> String.replace(definition.description, "\n", "\n/// ") <> "\n",
            else: ""

        body = FluentCI.Plugin.Codegen.component_body(value)

        record_source <>
          doc <>
          "pub fn #{identifier(Atom.to_string(name))}(#{parameters}) -> Result<String, String> {\nlet input = serde_json::json!({#{input}}).to_string();\nlet _ = &input;\nlet run = || -> Result<String, Error> {\n#{body}\n};\nrun().map_err(|error| error.to_string())\n}\n"
      end)

    helpers = ~S"""
    use fluentci_pdk::{dag, component::Error};
    #[allow(dead_code)]
    fn quote(value: &str) -> String { format!("'{}'", value.replace('\'', "'\\''")) }
    #[allow(dead_code)]
    unsafe fn execute_plan(request: String) -> Result<String, Error> {
      let request: serde_json::Value = serde_json::from_str(&request)?;
      fluentci_pdk::run_plan_value(&request["plan"], request["run_dir"].as_str().ok_or_else(|| Error::msg("Missing run directory"))?)
    }
    """

    helpers <> Enum.join(functions, "\n")
  end

  defp identifier(name) do
    value = String.replace(name, "-", "_")

    unless Regex.match?(~r/^[a-z][a-z0-9_]*$/, value),
      do: raise(ArgumentError, "invalid component identifier #{name}")

    "r#" <> value
  end

  defp rust_type(type) do
    if String.ends_with?(type, "[]") do
      "Vec<#{rust_type(String.trim_trailing(type, "[]"))}>"
    else
      case type do
        "string" -> "String"
        "integer" -> "i32"
        "number" -> "f64"
        "boolean" -> "bool"
      end
    end
  end
end
