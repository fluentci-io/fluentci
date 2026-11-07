defmodule FluentCI.Plugin.Codegen do
  @moduledoc "Pure generation of Rust PDK guest source from plugin declarations."
  alias FluentCI.Plugin.{Input, Pipeline}

  @reserved ~w(as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while)

  @spec source([{atom(), Pipeline.t() | Input.t() | String.t()}]) :: String.t()
  def source(exports, docs \\ %{})

  def source(exports, docs) when is_list(exports) and exports != [] do
    functions = Enum.map_join(exports, "\n", &export/1)
    metadata = JSON.encode!(%{functions: metadata(exports, docs)})
    bytes = metadata |> :binary.bin_to_list() |> Enum.join(",")

    execution_import =
      if Enum.any?(exports, fn {_, value} -> match?(%FluentCI.Plugin.Execution{}, value) end),
        do: "#[host_fn] extern \"ExtismHost\" { fn execute_plan(input: String) -> String; }",
        else: ""

    """
    use extism_pdk::*;
    use fluentci_pdk::dag;
    #[used]
    #[cfg_attr(target_arch = "wasm32", link_section = "fluentci:metadata")]
    static FLUENTCI_METADATA: [u8; #{byte_size(metadata)}] = [#{bytes}];
    #{execution_import}
    fn quote(value: &str) -> String { format!("'{}'", value.replace('\\\'', "'\\\\''")) }
    #{functions}
    """
  end

  def source(_, _), do: raise(ArgumentError, "plugin must declare at least one defplugin export")

  @doc "Inspect the same immutable declarations used to generate the guest."
  def metadata(exports, docs \\ %{}) do
    Enum.map(exports, fn {name, value} ->
      {description, parameters} = documentation(Map.get(docs, name))
      inputs = inputs(value)
      raw = Enum.any?(inputs, &is_nil(&1.name))
      named = Enum.reject(inputs, &is_nil(&1.name))

      if raw and named != [],
        do: raise(ArgumentError, "cannot mix raw input and typed named fields in one export")

      fields =
        Enum.reduce(named, [], fn input, fields ->
          FluentCI.Plugin.argument(input.name, input.type)
          field = %{name: input.name, type: input.type}

          field =
            if parameters[input.name],
              do: Map.put(field, :description, parameters[input.name]),
              else: field

          case Enum.find(fields, &(&1.name == input.name)) do
            nil -> fields ++ [field]
            %{type: type} when type == input.type -> fields
            _ -> raise ArgumentError, "conflicting types for named argument #{input.name}"
          end
        end)

      function = %{name: Atom.to_string(name), returnType: "String"}

      function =
        if description == "", do: function, else: Map.put(function, :description, description)

      if raw, do: function, else: Map.merge(function, %{inputFormat: "json", args: fields})
    end)
  end

  defp inputs(%Input{} = input), do: [input]
  defp inputs(value) when is_struct(value), do: value |> Map.from_struct() |> inputs()
  defp inputs(value) when is_map(value), do: value |> Map.values() |> Enum.flat_map(&inputs/1)

  defp inputs(value) when is_tuple(value),
    do: value |> Tuple.to_list() |> Enum.flat_map(&inputs/1)

  defp inputs(value) when is_list(value), do: Enum.flat_map(value, &inputs/1)
  defp inputs(_), do: []

  defp documentation({_, text}) when is_binary(text) do
    {lines, parameters} =
      Enum.reduce(String.split(text, "\n"), {[], %{}}, fn line, {lines, parameters} ->
        case Regex.run(~r/^\s*@param\s+([\w-]+)\s+(.*)$/, line) do
          [_, name, description] -> {lines, Map.put(parameters, name, description)}
          _ -> {lines ++ [line], parameters}
        end
      end)

    {lines |> Enum.join("\n") |> String.trim(), parameters}
  end

  defp documentation(_), do: {"", %{}}

  defp export({name, value}) do
    name = Atom.to_string(name)

    unless Regex.match?(~r/^[a-z][a-z0-9_]*$/, name) and name not in @reserved,
      do: raise(ArgumentError, "invalid plugin export name: #{name}")

    body = expression(value)
    "#[plugin_fn]\npub fn #{name}(input: String) -> FnResult<String> {\n#{body}\n}\n"
  end

  @doc false
  def component_body(value), do: expression(value)

  defp expression(%Pipeline{} = pipeline) do
    initial = "let pipeline = dag().pipeline(&#{value(pipeline.name)})?;"
    steps = Enum.map_join(pipeline.steps, "\n", &step/1)
    "#{initial}\n#{steps}\nOk(pipeline.#{pipeline.capture}()?)"
  end

  defp expression(%FluentCI.Plugin.Execution{
         plan: plan,
         run_dir: directory,
         fail_on_error: strict
       }) do
    encoded =
      case FluentCI.Host.compile(plan) do
        {:ok, value} -> value
        {:error, error} -> raise ArgumentError, "invalid execution plan: #{inspect(error)}"
      end

    check =
      if strict do
        ~S"""
        if serde_json::from_str::<serde_json::Value>(&response)?["outcome"] != "succeeded" {
          return Err(Error::msg("matrix jobs failed; see the run result").into());
        }
        """
      else
        ""
      end

    """
    let plan: serde_json::Value = serde_json::from_str(&#{value(encoded)})?;
    let request = serde_json::json!({"plan": plan, "run_dir": #{value(directory)}});
    let response = unsafe { execute_plan(request.to_string()) }?;
    #{check}
    Ok(response)
    """
  end

  defp expression(%Input{name: nil}), do: "Ok(input)"
  defp expression(%Input{} = argument), do: "Ok(#{value(argument)})"
  defp expression(text) when is_binary(text), do: "Ok(#{value(text)})"

  defp expression(_),
    do: raise(ArgumentError, "defplugin must return a pipeline, input(), or string")

  defp step({:exec, arguments}) do
    arguments = Enum.map_join(arguments, ",", &value/1)

    """
    let arguments = vec![#{arguments}];
    let arguments: Vec<String> = arguments.iter().map(|value| quote(value)).collect();
    let pipeline = pipeline.with_exec(arguments.iter().map(String::as_str).collect())?;
    """
  end

  defp step({:shell, command}),
    do: "let pipeline = pipeline.with_exec(vec![&#{value(command)}])?;"

  defp step({:workdir, path}), do: "let pipeline = pipeline.with_workdir(&#{value(path)})?;"

  defp step({:env, key, data}),
    do: "let pipeline = pipeline.with_env_variable(&#{value(key)}, &#{value(data)})?;"

  defp step({:cache, key, path}) do
    "let cache = dag().cache(&#{value(key)})?;\nlet pipeline = pipeline.with_cache(&#{value(path)}, &cache.id)?;"
  end

  defp value(%Input{name: nil}), do: "input.clone()"

  defp value(%Input{name: name, type: type}) do
    FluentCI.Plugin.argument(name, type)

    {array, scalar} =
      if String.ends_with?(type, "[]"),
        do: {true, String.trim_trailing(type, "[]")},
        else: {false, type}

    predicate =
      case scalar do
        "string" -> "v.as_str().is_some_and(|s| !s.contains('\\0'))"
        "integer" -> "v.as_i64().is_some_and(|n| i32::try_from(n).is_ok())"
        "number" -> "v.as_f64().is_some_and(f64::is_finite)"
        "boolean" -> "v.is_boolean()"
      end

    predicate =
      if array,
        do: "value.as_array().is_some_and(|items| items.iter().all(|v| #{predicate}))",
        else: "{ let v = value; #{predicate} }"

    result =
      if type == "string", do: "value.as_str().unwrap().to_owned()", else: "value.to_string()"

    """
    {
      let object: serde_json::Value = serde_json::from_str(&input)?;
      let value = object.get(&#{value(name)}).ok_or_else(|| Error::msg("missing named argument"))?;
      if !(#{predicate}) { return Err(Error::msg("invalid named argument type").into()); }
      #{result}
    }
    """
  end

  defp value(text) when is_binary(text) do
    # Raw strings preserve Unicode, backslashes and quotes without interpreting
    # Elixir values as Rust source. Increase delimiters until the value fits.
    hashes =
      Stream.iterate(0, &(&1 + 1))
      |> Enum.find(fn count ->
        not String.contains?(text, "\"" <> String.duplicate("#", count))
      end)

    marker = String.duplicate("#", hashes)
    "r#{marker}\"#{text}\"#{marker}.to_owned()"
  end
end
