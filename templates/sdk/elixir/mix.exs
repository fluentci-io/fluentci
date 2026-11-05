defmodule FluentCI.Main.MixProject do
  use Mix.Project

  def project do
    [app: :fluentci_main, version: "0.1.0", elixir: ">= 1.18.0",
     deps: [{:fluentci, path: ".sdk/elixir"}]]
  end
end
