defmodule FluentCI.Plugin.Input do
  @moduledoc "A plugin invocation's UTF-8 input, resolved inside Wasm."
  defstruct []
  @type t :: %__MODULE__{}
end

defmodule FluentCI.Plugin.Pipeline do
  @moduledoc "Immutable pipeline description compiled into a FluentCI Wasm guest."
  @enforce_keys [:name]
  defstruct [:name, steps: [], capture: :stdout]
  @type value :: String.t() | FluentCI.Plugin.Input.t()
  @type t :: %__MODULE__{name: value(), steps: list(), capture: :stdout | :stderr}
end

defmodule FluentCI.Plugin.Execution do
  @moduledoc "A complete independent host plan executed as one guest effect."
  @enforce_keys [:plan, :run_dir]
  defstruct [:plan, :run_dir, fail_on_error: true]
end

defmodule FluentCI.Plugin do
  @moduledoc """
  Plugin-authoring DSL. Declarations are immutable data; they perform no engine IO.
  `mix fluentci.plugin.build` generates a Rust PDK guest and compiles it to Wasm.
  This is a CI DSL subset, not a general Elixir/BEAM-to-Wasm compiler.
  """
  alias FluentCI.Plugin.{Input, Pipeline}
  @type value :: Pipeline.value()

  defmacro __using__(_) do
    quote do
      import FluentCI.Plugin
      Module.register_attribute(__MODULE__, :fluentci_exports, accumulate: true)
      @before_compile FluentCI.Plugin
    end
  end

  defmacro defplugin(name, do: body) do
    name =
      case name do
        {identifier, _, nil} when is_atom(identifier) -> identifier
        identifier when is_atom(identifier) -> identifier
        _ -> raise ArgumentError, "defplugin requires an export name"
      end

    quote location: :keep do
      @fluentci_exports {unquote(name), unquote(body)}
    end
  end

  defmacro __before_compile__(environment) do
    exports = environment.module |> Module.get_attribute(:fluentci_exports) |> Enum.reverse()
    names = Enum.map(exports, &elem(&1, 0))
    if Enum.uniq(names) != names, do: raise(ArgumentError, "duplicate plugin export")

    quote do
      def __fluentci_exports__, do: unquote(Macro.escape(exports))
    end
  end

  @spec input() :: Input.t()
  def input, do: %Input{}

  @doc "Execute an independent host plan; matrix members run under the shared scheduler."
  def run_plan(%FluentCI.Host.Plan{} = plan, run_dir, options \\ []) do
    strict = Keyword.get(options, :fail_on_error, true)
    unless is_boolean(strict), do: raise(ArgumentError, "fail_on_error must be boolean")
    %FluentCI.Plugin.Execution{plan: plan, run_dir: value!(run_dir), fail_on_error: strict}
  end

  @spec pipeline(value()) :: Pipeline.t()
  def pipeline(name), do: %Pipeline{name: value!(name)}
  @spec exec(Pipeline.t(), [value()]) :: Pipeline.t()
  def exec(%Pipeline{} = pipeline, [program | arguments]) do
    values = Enum.map([program | arguments], &value!/1)
    append(pipeline, {:exec, values})
  end

  def exec(_, _), do: raise(ArgumentError, "exec requires [program, ...arguments]")
  @spec shell(Pipeline.t(), value()) :: Pipeline.t()
  def shell(%Pipeline{} = pipeline, command), do: append(pipeline, {:shell, value!(command)})
  @spec workdir(Pipeline.t(), value()) :: Pipeline.t()
  def workdir(%Pipeline{} = pipeline, path), do: append(pipeline, {:workdir, value!(path)})
  @spec env(Pipeline.t(), value(), value()) :: Pipeline.t()
  def env(%Pipeline{} = pipeline, key, value),
    do: append(pipeline, {:env, value!(key), value!(value)})

  @spec cache(Pipeline.t(), value(), value()) :: Pipeline.t()
  def cache(%Pipeline{} = pipeline, key, path),
    do: append(pipeline, {:cache, value!(key), value!(path)})

  @spec stdout(Pipeline.t()) :: Pipeline.t()
  def stdout(%Pipeline{} = pipeline), do: %{pipeline | capture: :stdout}
  @spec stderr(Pipeline.t()) :: Pipeline.t()
  def stderr(%Pipeline{} = pipeline), do: %{pipeline | capture: :stderr}
  defp append(pipeline, step), do: %{pipeline | steps: pipeline.steps ++ [step]}
  defp value!(%Input{} = input), do: input

  defp value!(text) when is_binary(text) do
    if String.valid?(text) and not String.contains?(text, <<0>>),
      do: text,
      else: raise(ArgumentError, "plugin values require UTF-8 strings without NUL")
  end

  defp value!(_), do: raise(ArgumentError, "plugin values must be strings or input()")
end
