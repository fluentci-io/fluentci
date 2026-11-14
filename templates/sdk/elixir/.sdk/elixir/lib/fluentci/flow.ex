defmodule FluentCI.Flow do
  @moduledoc "Immutable component/native pipelines, compiled into typed Wasm imports."
  defstruct [:name, steps: []]

  def pipeline(name) when is_binary(name), do: %__MODULE__{name: name}
  def exec(%__MODULE__{} = pipeline, argv) when is_list(argv) and argv != [],
    do: append(pipeline, {:exec, argv})
  def workdir(%__MODULE__{} = pipeline, path), do: append(pipeline, {:workdir, path})
  def env(%__MODULE__{} = pipeline, key, value), do: append(pipeline, {:env, key, value})
  def stdout(%__MODULE__{} = pipeline), do: pipeline

  @doc false
  def module_step(%__MODULE__{} = pipeline, alias_name, function, arguments, contract) do
    unless is_map(arguments), do: raise(ArgumentError, "module arguments must be named fields")
    fields = contract["params"] |> hd() |> Map.fetch!("type") |> Map.fetch!("fields")
    known = MapSet.new(fields, &String.replace(&1["name"], "-", "_"))
    arguments = Map.new(arguments, fn {key, value} -> {to_string(key), value} end)
    Enum.each(Map.keys(arguments), fn key ->
      unless MapSet.member?(known, key), do: raise(ArgumentError, "Unknown module argument #{key}")
    end)
    Enum.each(fields, fn field ->
      key = String.replace(field["name"], "-", "_")
      unless field["type"]["kind"] == "option" or key in ["project", "run_dir"] or Map.has_key?(arguments, key),
        do: raise(ArgumentError, "Missing module argument #{key}")
    end)
    append(pipeline, {:module, alias_name, function, arguments, contract})
  end

  defp append(pipeline, step), do: %{pipeline | steps: pipeline.steps ++ [step]}
end

defmodule FluentCI.Flow.Codegen do
  @moduledoc false
  def expression(%FluentCI.Flow{} = flow) do
    name = JSON.encode!(flow.name)
    initial = "let pipeline = dag().pipeline(#{name})?;\nlet mut directory = String::from(\".\");\nlet run_id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|Error::msg(e.to_string()))?.as_nanos();\nlet mut last = serde_json::Value::Null;"
    {steps, pending} = Enum.map_reduce(Enum.with_index(flow.steps), false, fn
      {{:exec, argv}, _index}, _pending ->
        args = Enum.map_join(argv, ",", &value/1)
        {"let argv = vec![#{args}];\nlet pipeline = pipeline.with_exec(argv.iter().map(|v|quote(v)).collect::<Vec<_>>().iter().map(String::as_str).collect())?;", true}
      {{:workdir, path}, _}, pending ->
        {"directory = #{value(path)};\nlet pipeline = pipeline.with_workdir(&directory)?;", pending}
      {{:env, key, data}, _}, pending ->
        {"let pipeline = pipeline.with_env_variable(&#{value(key)}, &#{value(data)})?;", pending}
      {{:module, alias_name, function, args, contract}, index}, pending ->
        label = String.replace(alias_name, "-", "_")
        function_name = String.replace(function, "-", "_")
        fields = hd(contract["params"])["type"]["fields"]
        entries = Enum.map_join(fields, ",", fn field ->
          key = String.replace(field["name"], "-", "_")
          expression = case Map.fetch(args, key) do
            {:ok, argument} -> json_value(argument)
            :error when key == "project" -> "serde_json::json!(directory)"
            :error when key == "run_dir" -> "serde_json::json!(format!(\".fluentci/runs/{}/#{index}\", run_id))"
            :error -> "serde_json::Value::Null"
          end
          "#{JSON.encode!(key)}: #{expression}"
        end)
        flush = if pending, do: "let _ = pipeline.stdout()?;\n", else: ""
        {flush <> "last = pipeline_#{label}::#{label}_#{function_name}(serde_json::json!({#{entries}}))?;\nlet pipeline = dag().pipeline(#{name})?.with_workdir(&directory)?;", false}
    end)
    terminal = if pending, do: "Ok(pipeline.stdout()?)", else: "Ok(last.to_string())"
    initial <> "\n" <> Enum.join(steps, "\n") <> "\n" <> terminal
  end

  defp value(%FluentCI.Plugin.Input{name: name}), do: "serde_json::from_str::<serde_json::Value>(&input)?[#{JSON.encode!(name)}].as_str().ok_or_else(||Error::msg(\"Expected a string\"))?.to_owned()"
  defp value(value) when is_binary(value), do: "String::from(#{JSON.encode!(value)})"
  defp json_value(%FluentCI.Plugin.Input{name: name}), do: "serde_json::from_str::<serde_json::Value>(&input)?[#{JSON.encode!(name)}].clone()"
  defp json_value(value), do: "serde_json::from_str::<serde_json::Value>(#{JSON.encode!(JSON.encode!(value))})?"
end
