defmodule Main do
  use FluentCI.Plugin

  @doc "Greet someone from a native Wasm component."
  defplugin hello do
    "Hello from FluentCI"
  end

  @doc """
  Echo a typed argument.
  @param name Text to echo.
  """
  defplugin echo do
    argument("name", "string")
  end
end
