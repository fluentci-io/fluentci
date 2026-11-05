defmodule FluentCI.Application do
  @moduledoc false
  use Application
  @impl true
  def start(_type, _args) do
    Supervisor.start_link(
      [{DynamicSupervisor, strategy: :one_for_one, name: FluentCI.Host.Local.Supervisor}],
      strategy: :one_for_one,
      name: FluentCI.Supervisor
    )
  end
end
