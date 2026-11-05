defmodule FluentCI.Plugin.Codegen do
  @moduledoc "Pure generation of Rust PDK guest source from plugin declarations."
  alias FluentCI.Plugin.{Input, Pipeline}

  @reserved ~w(as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while)

  @spec source([{atom(), Pipeline.t() | Input.t() | String.t()}]) :: String.t()
  def source(exports) when is_list(exports) and exports != [] do
    functions = Enum.map_join(exports, "\n", &export/1)

    execution_import =
      if Enum.any?(exports, fn {_, value} -> match?(%FluentCI.Plugin.Execution{}, value) end),
        do: "#[host_fn] extern \"ExtismHost\" { fn execute_plan(input: String) -> String; }",
        else: ""

    """
    use extism_pdk::*;
    use fluentci_pdk::dag;
    #{execution_import}
    fn quote(value: &str) -> String { format!("'{}'", value.replace('\\\'', "'\\\\''")) }
    #{functions}
    """
  end

  def source(_), do: raise(ArgumentError, "plugin must declare at least one defplugin export")

  defp export({name, value}) do
    name = Atom.to_string(name)

    unless Regex.match?(~r/^[a-z][a-z0-9_]*$/, name) and name not in @reserved,
      do: raise(ArgumentError, "invalid plugin export name: #{name}")

    body = expression(value)
    "#[plugin_fn]\npub fn #{name}(input: String) -> FnResult<String> {\n#{body}\n}\n"
  end

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

  defp expression(%Input{}), do: "Ok(input)"
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

  defp value(%Input{}), do: "input.clone()"

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
