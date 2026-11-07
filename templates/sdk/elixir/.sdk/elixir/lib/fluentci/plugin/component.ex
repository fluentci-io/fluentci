defmodule FluentCI.Plugin.Component do
  @moduledoc "Generate typed Rust jobs and WIT from the compiled Elixir plugin DSL."
  alias FluentCI.Plugin.{Input, Pipeline}

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
            "#{literal(field.name)}: args.#{identifier(field.name)}"
          end)

        doc =
          if definition[:description],
            do: "/// " <> String.replace(definition.description, "\n", "\n/// ") <> "\n",
            else: ""

        record_source <>
          doc <>
          "pub fn #{identifier(Atom.to_string(name))}(#{parameters}) -> Result<String, String> {\nlet _input = serde_json::json!({#{input}});\n#{body(value)}\n}\n"
      end)

    Enum.join(functions, "\n")
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

  defp literal(value), do: JSON.encode!(value) <> ".to_string()"

  defp value(%Input{name: name}),
    do:
      "_input[#{JSON.encode!(name)}].as_str().map(str::to_owned).unwrap_or_else(|| _input[#{JSON.encode!(name)}].to_string())"

  defp value(text) when is_binary(text), do: literal(text)

  defp body(%Input{} = input), do: "Ok(#{value(input)})"
  defp body(text) when is_binary(text), do: "Ok(#{value(text)})"

  defp body(%FluentCI.Plugin.Execution{plan: plan, run_dir: directory, fail_on_error: strict}) do
    {:ok, encoded} = FluentCI.Host.compile(plan)
    execution(value(encoded), value(directory), strict)
  end

  defp body(%Pipeline{} = pipeline) do
    {tasks, _, _, _} =
      Enum.reduce(pipeline.steps, {[], "." |> literal(), [], nil}, fn step,
                                                                      {tasks, cwd, env, previous} ->
        case step do
          {:workdir, path} ->
            {tasks, value(path), env, previous}

          {:env, key, data} ->
            {tasks, cwd, env ++ ["(#{value(key)}, #{value(data)})"], previous}

          {:cache, _, _} ->
            raise ArgumentError,
                  "component pipelines use typed Host task cache policies; legacy pipeline cache mounts are not supported"

          command ->
            id = "step-#{length(tasks)}"

            {program, arguments} =
              case command do
                {:exec, [program | arguments]} ->
                  {value(program), Enum.map_join(arguments, ",", &value/1)}

                {:shell, text} ->
                  {literal("sh"), literal("-c") <> "," <> value(text)}
              end

            needs = if previous, do: JSON.encode!([previous]), else: "[]"

            task =
              "serde_json::json!({\"id\": #{JSON.encode!(id)}, \"program\": #{program}, \"args\": [#{arguments}], \"cwd\": #{cwd}, \"env\": [#{Enum.join(env, ",")}].into_iter().collect::<std::collections::BTreeMap<String,String>>(), \"needs\": #{needs}})"

            {tasks ++ [task], cwd, env, id}
        end
      end)

    # Native component pipelines return the structured execution report. Explicit
    # plans expose the same report, including task logs, statuses and durations.
    plan =
      "serde_json::json!({\"version\":1, \"inherit_env\":false, \"jobs\":4, \"max_services\":8, \"fail_fast\":true, \"tasks\":[#{Enum.join(tasks, ",")}]}).to_string()"

    execution(
      plan,
      ~S'format!(".fluentci/runs/component-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos())',
      true
    )
  end

  defp execution(plan, directory, strict) do
    check =
      if strict,
        do:
          "if serde_json::from_str::<serde_json::Value>(&response).map_err(|e| e.to_string())?[\"outcome\"] != \"succeeded\" { return Err(\"plan failed; see the run report\".to_string()); }",
        else: ""

    "let response = crate::fluentci::runtime::host::execute_plan(&#{plan}, &#{directory})?;\n#{check}\nOk(response)"
  end
end
