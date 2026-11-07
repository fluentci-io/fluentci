defmodule Main do
  use FluentCI.Plugin
  defplugin parity do
    pipeline("component-parity") |> exec(["printf", "capability-parity"])
  end
  defplugin hello do
    "Hello from FluentCI"
  end
  defplugin echo do
    argument("name", "string")
  end
end
