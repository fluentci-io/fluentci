defmodule FluentCI.Host.Result.Error do
  @moduledoc "A decoding failure with a field path and no report contents."
  defstruct [:path, :reason]
  @type t :: %__MODULE__{path: [String.t() | non_neg_integer()], reason: atom()}
end

defmodule FluentCI.Host.Result.Cache do
  @moduledoc "Cache diagnostics. Outcome strings remain open to future engine variants."
  defstruct [:outcome, :key, :reason, components: %{}]

  @type t :: %__MODULE__{
          outcome: String.t(),
          key: String.t() | nil,
          reason: String.t(),
          components: %{String.t() => String.t()}
        }
end

defmodule FluentCI.Host.Result.ProbeLogs do
  @moduledoc "Paths to exact binary readiness and health probe logs."
  defstruct [:stdout, :stderr]
  @type t :: %__MODULE__{stdout: String.t(), stderr: String.t()}
end

defmodule FluentCI.Host.Result.Task do
  @moduledoc "A terminal task report, including cache and service diagnostics."
  defstruct [
    :id,
    :status,
    :exit_code,
    :error,
    :duration_ms,
    :stdout,
    :stderr,
    :cache,
    :probe_logs,
    :wait_reason,
    :file_result
  ]

  @type status :: :succeeded | :failed | :skipped | :cancelled | :timed_out
  @type t :: %__MODULE__{
          id: String.t(),
          status: status(),
          exit_code: integer() | nil,
          error: String.t() | nil,
          duration_ms: non_neg_integer(),
          stdout: String.t(),
          stderr: String.t(),
          cache: FluentCI.Host.Result.Cache.t(),
          probe_logs: FluentCI.Host.Result.ProbeLogs.t() | nil,
          wait_reason: String.t() | nil,
          file_result: term()
        }
end

defmodule FluentCI.Host.Result do
  @moduledoc """
  Pure decoding of terminal host reports into structs and fixed status atoms.
  Missing/null outcomes remain `nil` for older reports; no cancellation outcome is
  inferred from task statuses. Unknown fields are ignored for forward compatibility.
  Unknown/nonterminal statuses, duplicate IDs and contradictory outcomes are rejected.
  Decoding reads no files and creates no atoms from external input.
  """
  alias __MODULE__.{Cache, Error, ProbeLogs, Task}
  defstruct [:outcome, tasks: []]
  @type outcome :: :succeeded | :failed | :cancelled
  @type t :: %__MODULE__{outcome: outcome() | nil, tasks: [Task.t()]}
  @statuses %{
    "succeeded" => :succeeded,
    "failed" => :failed,
    "skipped" => :skipped,
    "cancelled" => :cancelled,
    "timed_out" => :timed_out
  }
  @outcomes Map.take(@statuses, ["succeeded", "failed", "cancelled"])
  @max_duration 340_282_366_920_938_463_463_374_607_431_768_211_455

  @spec decode(String.t()) :: {:ok, t()} | {:error, Error.t()}
  def decode(json) when is_binary(json) do
    case JSON.decode(json) do
      {:ok, value} -> from_map(value)
      {:error, _} -> invalid([], :invalid_json)
    end
  end

  def decode(_), do: invalid([], :invalid_json)

  @doc "Decode an already parsed, string-keyed JSON object."
  @spec from_map(term()) :: {:ok, t()} | {:error, Error.t()}
  def from_map(value) when is_map(value) and not is_struct(value) do
    with {:ok, tasks} <- tasks(value["tasks"]),
         {:ok, outcome} <- outcome(value["outcome"]),
         :ok <- consistent(tasks, outcome) do
      {:ok, %__MODULE__{tasks: tasks, outcome: outcome}}
    end
  end

  def from_map(_), do: invalid([], :expected_object)

  @doc "Whether every task succeeded, including reports from older engines without outcome."
  @spec succeeded?(t()) :: boolean()
  def succeeded?(%__MODULE__{tasks: tasks}), do: Enum.all?(tasks, &(&1.status == :succeeded))

  defp tasks(values) when is_list(values) do
    values
    |> Enum.with_index()
    |> Enum.reduce_while({:ok, [], MapSet.new()}, fn {value, index}, {:ok, acc, seen} ->
      case task(value, ["tasks", index]) do
        {:ok, entry} ->
          if MapSet.member?(seen, entry.id) do
            {:halt, invalid(["tasks", index, "id"], :duplicate_id)}
          else
            {:cont, {:ok, [entry | acc], MapSet.put(seen, entry.id)}}
          end

        error ->
          {:halt, error}
      end
    end)
    |> case do
      {:ok, acc, _} -> {:ok, Enum.reverse(acc)}
      error -> error
    end
  end

  defp tasks(_), do: invalid(["tasks"], :expected_array)
  defp outcome(nil), do: {:ok, nil}
  defp outcome(value), do: enum(value, @outcomes, ["outcome"])

  defp consistent(tasks, outcome) do
    succeeded = Enum.all?(tasks, &(&1.status == :succeeded))

    if (outcome == :succeeded and not succeeded) or
         (outcome in [:failed, :cancelled] and succeeded),
       do: invalid(["outcome"], :inconsistent_outcome),
       else: :ok
  end

  defp task(value, path) when is_map(value) and not is_struct(value) do
    with {:ok, id} <- text(value["id"], path ++ ["id"]),
         :ok <- nonempty(id, path ++ ["id"]),
         {:ok, status} <- enum(value["status"], @statuses, path ++ ["status"]),
         {:ok, exit_code} <- optional_integer(value["exit_code"], path ++ ["exit_code"]),
         {:ok, error} <- optional_text(value["error"], path ++ ["error"]),
         {:ok, duration} <- duration(value["duration_ms"], path ++ ["duration_ms"]),
         {:ok, stdout} <- text(value["stdout"], path ++ ["stdout"]),
         {:ok, stderr} <- text(value["stderr"], path ++ ["stderr"]),
         {:ok, cache} <- cache(value["cache"], path ++ ["cache"]),
         {:ok, probe_logs} <- probe_logs(value["probe_logs"], path ++ ["probe_logs"]),
         {:ok, wait_reason} <- optional_text(value["wait_reason"], path ++ ["wait_reason"]) do
      {:ok,
       %Task{
         id: id,
         status: status,
         exit_code: exit_code,
         error: error,
         duration_ms: duration,
         stdout: stdout,
         stderr: stderr,
         cache: cache,
         probe_logs: probe_logs,
         wait_reason: wait_reason,
         file_result: value["file_result"]
       }}
    end
  end

  defp task(_, path), do: invalid(path, :expected_object)

  defp cache(value, path) when is_map(value) and not is_struct(value) do
    with {:ok, outcome} <- text(value["outcome"], path ++ ["outcome"]),
         {:ok, key} <- optional_text(value["key"], path ++ ["key"]),
         {:ok, reason} <- text(value["reason"], path ++ ["reason"]),
         {:ok, components} <-
           components(Map.get(value, "components", %{}), path ++ ["components"]) do
      {:ok, %Cache{outcome: outcome, key: key, reason: reason, components: components}}
    end
  end

  defp cache(_, path), do: invalid(path, :expected_object)

  defp components(value, path) when is_map(value) and not is_struct(value) do
    if Enum.all?(value, fn {key, entry} -> string?(key) and string?(entry) end),
      do: {:ok, value},
      else: invalid(path, :expected_string_map)
  end

  defp components(_, path), do: invalid(path, :expected_string_map)
  defp probe_logs(nil, _), do: {:ok, nil}

  defp probe_logs(value, path) when is_map(value) and not is_struct(value) do
    with {:ok, stdout} <- text(value["stdout"], path ++ ["stdout"]),
         {:ok, stderr} <- text(value["stderr"], path ++ ["stderr"]) do
      {:ok, %ProbeLogs{stdout: stdout, stderr: stderr}}
    end
  end

  defp probe_logs(_, path), do: invalid(path, :expected_object)
  defp optional_text(nil, _), do: {:ok, nil}
  defp optional_text(value, path), do: text(value, path)

  defp text(value, path),
    do: if(string?(value), do: {:ok, value}, else: invalid(path, :expected_string))

  defp string?(value), do: is_binary(value) and String.valid?(value)
  defp nonempty("", path), do: invalid(path, :empty_id)
  defp nonempty(_, _), do: :ok
  defp optional_integer(nil, _), do: {:ok, nil}

  defp optional_integer(value, _)
       when is_integer(value) and value >= -2_147_483_648 and value <= 2_147_483_647,
       do: {:ok, value}

  defp optional_integer(_, path), do: invalid(path, :expected_exit_code)

  defp duration(value, _)
       when is_integer(value) and value >= 0 and
              value <= @max_duration,
       do: {:ok, value}

  defp duration(_, path), do: invalid(path, :expected_duration)

  defp enum(value, known, path) do
    case Map.fetch(known, value) do
      {:ok, atom} -> {:ok, atom}
      :error -> invalid(path, :unknown_variant)
    end
  end

  defp invalid(path, reason), do: {:error, %Error{path: path, reason: reason}}
end
