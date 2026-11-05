defmodule FluentCI.Host.Journal.Error do
  @moduledoc "Journal failure without embedding malformed records or log text."
  defstruct [:kind, :reason, :cursor, path: []]

  @type t :: %__MODULE__{
          kind: :decode | :io | :cursor | :options,
          reason: atom(),
          cursor: non_neg_integer() | nil,
          path: [String.t()]
        }
end

defmodule FluentCI.Host.Journal.Event do
  @moduledoc "A typed journal record; log text is a display view, not exact binary output."
  defstruct [:sequence, :elapsed_ms, :trace_id, :span_id, :kind]

  @type status ::
          :pending
          | :running
          | :ready
          | :stopping
          | :succeeded
          | :failed
          | :skipped
          | :cancelled
          | :timed_out
  @type stream :: :stdout | :stderr | :probe_stdout | :probe_stderr
  @type kind ::
          {:run_started, non_neg_integer()}
          | {:run_finished, boolean()}
          | {:log, %{id: String.t(), stream: stream(), text: String.t()}}
          | {:task_state,
             %{
               id: String.t(),
               status: status(),
               cache: String.t(),
               reason: String.t(),
               wait_reason: String.t() | nil,
               error: String.t() | nil,
               duration_ms: non_neg_integer()
             }}
  @type t :: %__MODULE__{
          sequence: non_neg_integer(),
          elapsed_ms: non_neg_integer(),
          trace_id: String.t() | nil,
          span_id: String.t() | nil,
          kind: kind()
        }
end

defmodule FluentCI.Host.Journal.Batch do
  @moduledoc "Complete records and the next byte cursor. An empty batch may mean the run is still active."
  defstruct events: [], next_cursor: 0

  @type t :: %__MODULE__{
          events: [FluentCI.Host.Journal.Event.t()],
          next_cursor: non_neg_integer()
        }
end

defmodule FluentCI.Host.Journal do
  @moduledoc """
  Pure event decoding and bounded, resumable reads of a local execution journal.
  Cursors count bytes and advance only past complete newline-terminated records.
  Partial final records are retried on the next read. Inspect `:run_finished` to
  detect completion; empty pages alone do not establish that a run has ended.
  """
  alias __MODULE__.{Batch, Error, Event}
  @max_u64 18_446_744_073_709_551_615
  @page_bytes 4 * 1024 * 1024
  @statuses %{
    "pending" => :pending,
    "running" => :running,
    "ready" => :ready,
    "stopping" => :stopping,
    "succeeded" => :succeeded,
    "failed" => :failed,
    "skipped" => :skipped,
    "cancelled" => :cancelled,
    "timed_out" => :timed_out
  }
  @streams %{
    "stdout" => :stdout,
    "stderr" => :stderr,
    "probe_stdout" => :probe_stdout,
    "probe_stderr" => :probe_stderr
  }

  @spec decode(binary()) :: {:ok, Event.t()} | {:error, Error.t()}
  def decode(json) when is_binary(json) do
    case JSON.decode(json) do
      {:ok, value} -> from_map(value)
      {:error, _} -> invalid([], :invalid_json)
    end
  end

  def decode(_), do: invalid([], :invalid_json)

  @spec from_map(term()) :: {:ok, Event.t()} | {:error, Error.t()}
  def from_map(map) when is_map(map) and not is_struct(map) do
    with {:ok, sequence} <- natural(map, "sequence"),
         {:ok, elapsed} <- natural(map, "elapsed_ms"),
         {:ok, trace} <- optional(map, "trace_id"),
         {:ok, span} <- optional(map, "span_id"),
         {:ok, kind} <- kind(map) do
      {:ok,
       %Event{sequence: sequence, elapsed_ms: elapsed, trace_id: trace, span_id: span, kind: kind}}
    end
  end

  def from_map(_), do: invalid([], :expected_object)

  defp kind(%{"type" => "run_started"} = map) do
    with {:ok, tasks} <- natural(map, "tasks"), do: {:ok, {:run_started, tasks}}
  end

  defp kind(%{"type" => "run_finished", "success" => success}) when is_boolean(success),
    do: {:ok, {:run_finished, success}}

  defp kind(%{"type" => "run_finished"}), do: invalid(["success"], :expected_boolean)

  defp kind(%{"type" => "log"} = map) do
    with {:ok, id} <- id(map),
         {:ok, stream} <- choice(map, "stream", @streams),
         {:ok, text} <- string(map, "text") do
      {:ok, {:log, %{id: id, stream: stream, text: text}}}
    end
  end

  defp kind(%{"type" => "task_state"} = map) do
    with {:ok, id} <- id(map),
         {:ok, status} <- choice(map, "status", @statuses),
         {:ok, cache} <- string(map, "cache"),
         {:ok, reason} <- string(map, "reason"),
         {:ok, waiting} <- optional(map, "wait_reason"),
         {:ok, error} <- optional(map, "error"),
         {:ok, duration} <- natural(map, "duration_ms") do
      {:ok,
       {:task_state,
        %{
          id: id,
          status: status,
          cache: cache,
          reason: reason,
          wait_reason: waiting,
          error: error,
          duration_ms: duration
        }}}
    end
  end

  defp kind(_), do: invalid(["type"], :unknown_event)

  defp natural(map, key) do
    case map[key] do
      value when is_integer(value) and value >= 0 and value <= @max_u64 -> {:ok, value}
      _ -> invalid([key], :expected_u64)
    end
  end

  defp string(map, key) do
    value = map[key]

    if is_binary(value) and String.valid?(value),
      do: {:ok, value},
      else: invalid([key], :expected_string)
  end

  defp optional(map, key), do: if(is_nil(map[key]), do: {:ok, nil}, else: string(map, key))

  defp id(map) do
    with {:ok, id} <- string(map, "id") do
      if id != "", do: {:ok, id}, else: invalid(["id"], :empty_id)
    end
  end

  defp choice(map, key, choices) do
    case Map.fetch(choices, map[key]) do
      {:ok, value} -> {:ok, value}
      :error -> invalid([key], :unknown_variant)
    end
  end

  defp invalid(path, reason), do: {:error, %Error{kind: :decode, path: path, reason: reason}}

  @spec read(String.t(), non_neg_integer(), pos_integer()) ::
          {:ok, Batch.t()} | {:error, Error.t()}
  def read(run_directory, cursor \\ 0, limit \\ 100)

  def read(directory, cursor, limit)
      when is_binary(directory) and is_integer(cursor) and cursor >= 0 and cursor <= @max_u64 and
             is_integer(limit) and limit in 1..1000 do
    if directory != "" and String.valid?(directory) and not String.contains?(directory, <<0>>) do
      read_file(directory, cursor, limit)
    else
      {:error, %Error{kind: :options, reason: :invalid_options}}
    end
  end

  def read(_, _, _), do: {:error, %Error{kind: :options, reason: :invalid_options}}

  defp read_file(directory, cursor, limit) do
    path = Path.join(directory, "events.jsonl")

    with {:ok, stat} <- File.lstat(path),
         :ok <- regular(stat),
         :ok <- within(cursor, stat.size),
         {:ok, file} <- File.open(path, [:read, :binary]) do
      try do
        with :ok <- boundary(file, cursor),
             {:ok, _} <- :file.position(file, cursor),
             {:ok, bytes} <- bytes(file, limit) do
          page(bytes, cursor, limit, [], if(cursor == 0, do: 0, else: nil), @page_bytes)
        else
          {:error, %Error{} = error} -> {:error, error}
          {:error, reason} -> {:error, %Error{kind: :io, reason: reason, cursor: cursor}}
        end
      after
        File.close(file)
      end
    else
      {:error, :enoent} when cursor == 0 -> {:ok, %Batch{}}
      {:error, %Error{} = error} -> {:error, %{error | cursor: cursor}}
      {:error, reason} -> {:error, %Error{kind: :io, reason: reason, cursor: cursor}}
    end
  end

  defp regular(%File.Stat{type: :regular}), do: :ok
  defp regular(_), do: {:error, %Error{kind: :io, reason: :nonregular_journal}}
  defp within(cursor, size) when cursor <= size, do: :ok
  defp within(_, _), do: {:error, %Error{kind: :cursor, reason: :beyond_end}}
  defp boundary(_, 0), do: :ok

  defp boundary(file, cursor) do
    with {:ok, _} <- :file.position(file, cursor - 1), {:ok, "\n"} <- :file.read(file, 1) do
      :ok
    else
      _ -> {:error, %Error{kind: :cursor, reason: :not_record_boundary, cursor: cursor}}
    end
  end

  defp bytes(file, limit), do: chunks(file, limit, @page_bytes + 1, [])
  defp chunks(_, _, 0, parts), do: {:ok, IO.iodata_to_binary(Enum.reverse(parts))}

  defp chunks(file, lines, remaining, parts) do
    case :file.read(file, min(16_384, remaining)) do
      :eof ->
        {:ok, IO.iodata_to_binary(Enum.reverse(parts))}

      {:ok, bytes} ->
        lines = lines - length(:binary.matches(bytes, "\n"))
        parts = [bytes | parts]

        if lines <= 0 do
          {:ok, IO.iodata_to_binary(Enum.reverse(parts))}
        else
          chunks(file, lines, remaining - byte_size(bytes), parts)
        end

      error ->
        error
    end
  end

  defp page(_, cursor, 0, events, _, _), do: batch(events, cursor)

  defp page(bytes, cursor, limit, events, expected, budget) do
    case :binary.match(bytes, "\n") do
      {index, 1} when index + 1 <= budget ->
        line = binary_part(bytes, 0, index)
        rest = binary_part(bytes, index + 1, byte_size(bytes) - index - 1)

        case decode(line) do
          {:ok, event} when is_nil(expected) or event.sequence == expected ->
            page(
              rest,
              cursor + index + 1,
              limit - 1,
              [event | events],
              event.sequence + 1,
              budget - index - 1
            )

          {:ok, _} ->
            {:error, %Error{kind: :decode, reason: :sequence_gap, cursor: cursor}}

          {:error, error} ->
            {:error, %{error | cursor: cursor}}
        end

      _ when events != [] ->
        batch(events, cursor)

      _ when byte_size(bytes) > @page_bytes ->
        {:error, %Error{kind: :decode, reason: :record_too_large, cursor: cursor}}

      _ ->
        batch(events, cursor)
    end
  end

  defp batch(events, cursor), do: {:ok, %Batch{events: Enum.reverse(events), next_cursor: cursor}}
end
