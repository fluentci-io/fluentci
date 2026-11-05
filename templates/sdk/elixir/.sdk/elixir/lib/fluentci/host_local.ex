defmodule FluentCI.Host.Local.Error do
  @moduledoc "Local execution failure. Diagnostic bytes may contain command output."
  defstruct [:kind, :reason, :run_directory, :exit_status, diagnostics: ""]

  @type kind ::
          :invalid_plan
          | :configuration
          | :spawn
          | :io
          | :decode
          | :port
          | :signal
          | :timeout
          | :closed
  @type t :: %__MODULE__{
          kind: kind(),
          reason: term(),
          run_directory: String.t() | nil,
          exit_status: integer() | nil,
          diagnostics: binary()
        }
end

defmodule FluentCI.Host.Local.Execution do
  @moduledoc "An owned execution handle. Use Local.close/1 to release it; artifacts are retained."
  @enforce_keys [:pid, :run_directory]
  defstruct [:pid, :run_directory]
  @opaque t :: %__MODULE__{pid: pid(), run_directory: String.t()}
end

defmodule FluentCI.Host.Local.Report do
  @moduledoc "A decoded pipeline result and its CLI exit status."
  defstruct [:run_directory, :result, :exit_status]

  @type t :: %__MODULE__{
          run_directory: String.t(),
          result: FluentCI.Host.Result.t(),
          exit_status: integer()
        }
end

defmodule FluentCI.Host.Local do
  @moduledoc """
  Start and own a local Unix engine process without changing BEAM-global cwd/env.
  `await/2` returns after engine exit. `cancel/2` sends SIGINT and waits for the same
  result, allowing engine task/service cleanup. The starting process owns the run;
  its death initiates cancellation. Closing retains run files for inspection.
  """
  alias FluentCI.Host
  alias __MODULE__.{Error, Execution, Report, Worker}

  @spec start(Host.Plan.t(), keyword()) :: {:ok, Execution.t()} | {:error, Error.t()}
  def start(plan, opts \\ []) do
    case Host.compile(plan) do
      {:error, reason} ->
        {:error, %Error{kind: :invalid_plan, reason: reason}}

      {:ok, json} ->
        with {:ok, config} <- configure(opts),
             {:ok, _apps} <- Application.ensure_all_started(:fluentci),
             {:ok, pid} <-
               DynamicSupervisor.start_child(
                 FluentCI.Host.Local.Supervisor,
                 {Worker, {self(), JSON.decode!(json), config}}
               ) do
          call(pid, :handle, :infinity)
        else
          {:error, %Error{} = error} -> {:error, error}
          {:error, reason} when is_atom(reason) -> {:error, %Error{kind: :spawn, reason: reason}}
          {:error, _} -> {:error, %Error{kind: :spawn, reason: :worker_start_failed}}
        end
    end
  catch
    :exit, _ -> {:error, %Error{kind: :spawn, reason: :worker_unavailable}}
  end

  @spec await(Execution.t(), timeout()) :: {:ok, Report.t()} | {:error, Error.t()}
  def await(%Execution{pid: pid}, timeout \\ :infinity), do: call(pid, :await, timeout)
  @spec cancel(Execution.t(), timeout()) :: {:ok, Report.t()} | {:error, Error.t()}
  def cancel(%Execution{pid: pid}, timeout \\ :infinity), do: call(pid, :cancel, timeout)
  @spec close(Execution.t(), timeout()) :: :ok | {:error, Error.t()}
  def close(%Execution{pid: pid}, timeout \\ :infinity), do: call(pid, :close, timeout)
  @doc "Return the most recent 64 KiB of merged CLI diagnostic output, possibly mid-UTF-8."
  @spec output(Execution.t()) :: {:ok, binary()} | {:error, Error.t()}
  def output(%Execution{pid: pid}), do: call(pid, :output, 5000)

  @doc "Read a resumable typed journal page. Retained artifacts remain readable after close."
  @spec events(Execution.t(), non_neg_integer(), pos_integer()) ::
          {:ok, FluentCI.Host.Journal.Batch.t()} | {:error, FluentCI.Host.Journal.Error.t()}
  def events(%Execution{run_directory: directory}, cursor \\ 0, limit \\ 100),
    do: FluentCI.Host.Journal.read(directory, cursor, limit)

  defp call(pid, message, timeout) do
    GenServer.call(pid, message, timeout)
  catch
    :exit, {:timeout, _} -> {:error, %Error{kind: :timeout, reason: :await_timeout}}
    :exit, reason -> {:error, %Error{kind: :closed, reason: reason}}
  end

  defp configure(opts) do
    if Keyword.keyword?(opts) and
         Enum.all?(Keyword.keys(opts), &(&1 in [:binary, :run_root, :cwd, :env])) and
         length(Keyword.keys(opts)) == length(Enum.uniq(Keyword.keys(opts))) do
      initial_cwd = File.cwd!()
      cwd = Keyword.get(opts, :cwd, initial_cwd)
      root = Keyword.get(opts, :run_root, System.tmp_dir!())
      binary = Keyword.get(opts, :binary, "fluentci-engine")
      env = Keyword.get(opts, :env, %{})

      valid_env =
        is_map(env) and not is_struct(env) and
          Enum.all?(env, fn {key, value} ->
            text?(key) and key != "" and not String.contains?(key, "=") and
              (is_nil(value) or text?(value))
          end)

      if match?({:unix, _}, :os.type()) and
           Enum.all?([cwd, root, binary], &(text?(&1) and &1 != "")) and valid_env do
        cwd = Path.expand(cwd, initial_cwd)

        binary =
          if String.contains?(binary, "/"),
            do: Path.expand(binary, cwd),
            else: System.find_executable(binary)

        binary = if is_binary(binary), do: Path.expand(binary, initial_cwd), else: nil

        signal_binary =
          System.find_executable("kill") || System.find_executable("/bin/kill")

        signal_binary =
          if is_binary(signal_binary), do: Path.expand(signal_binary, initial_cwd), else: nil

        if File.dir?(cwd) and is_binary(binary) and File.regular?(binary) and
             is_binary(signal_binary) do
          {:ok,
           %{
             cwd: cwd,
             root: Path.expand(root, cwd),
             binary: binary,
             signal_binary: signal_binary,
             env:
               Enum.map(env, fn {key, value} ->
                 {String.to_charlist(key),
                  if(is_nil(value), do: false, else: String.to_charlist(value))}
               end)
           }}
        else
          {:error, %Error{kind: :configuration, reason: :missing_cwd_engine_or_signal_utility}}
        end
      else
        {:error, %Error{kind: :configuration, reason: :invalid_options_or_platform}}
      end
    else
      {:error, %Error{kind: :configuration, reason: :invalid_options}}
    end
  rescue
    error -> {:error, %Error{kind: :configuration, reason: Exception.message(error)}}
  end

  defp text?(value),
    do: is_binary(value) and String.valid?(value) and not String.contains?(value, <<0>>)
end

defmodule FluentCI.Host.Local.Worker do
  @moduledoc false
  use GenServer, restart: :temporary, shutdown: :infinity

  def start_link(args), do: GenServer.start_link(__MODULE__, args)
  alias FluentCI.Host.Result
  alias FluentCI.Host.Local.{Error, Execution, Report}
  @tail_limit 65_536
  @report_limit 16 * 1024 * 1024

  @impl true
  def init({owner, wire, config}) do
    Process.flag(:trap_exit, true)
    monitor = Process.monitor(owner)

    case prepare(wire, config) do
      {:ok, directory, run, plan} ->
        try do
          port =
            Port.open({:spawn_executable, config.binary}, [
              :binary,
              :exit_status,
              :stderr_to_stdout,
              args: ["execute", plan, "--run-dir", run, "--progress", "plain"],
              cd: config.cwd,
              env: config.env
            ])

          {:ok,
           %{
             owner: owner,
             monitor: monitor,
             port: port,
             signal_binary: config.signal_binary,
             run: run,
             directory: directory,
             ids: Enum.map(wire["tasks"], & &1["id"]),
             tail: "",
             result: nil,
             waiters: %{},
             interrupted: false,
             closing: false
           }}
        rescue
          error ->
            File.rm_rf(directory)

            {:ok,
             %{
               owner: owner,
               monitor: monitor,
               boot_error: %Error{kind: :spawn, reason: Exception.message(error)}
             }}
        end

      {:error, error} ->
        {:ok, %{owner: owner, monitor: monitor, boot_error: error}}
    end
  end

  defp prepare(wire, config) do
    directory =
      Path.join(
        config.root,
        "run-" <> Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
      )

    with :ok <- File.mkdir_p(config.root), :ok <- File.mkdir(directory) do
      try do
        File.chmod!(directory, 0o700)
        run = Path.join(directory, "execution")
        plan = Path.join(directory, "plan.json")
        wire = normalize(wire, config.cwd)
        File.write!(plan, JSON.encode!(wire), [:exclusive])
        File.chmod!(plan, 0o600)
        {:ok, directory, run, plan}
      rescue
        error ->
          File.rm_rf(directory)
          {:error, %Error{kind: :io, reason: Exception.message(error)}}
      end
    else
      {:error, reason} -> {:error, %Error{kind: :io, reason: reason}}
    end
  end

  defp normalize(wire, cwd) do
    wire =
      Enum.reduce(["cache_dir", "resource_dir"], wire, fn key, value ->
        if Map.has_key?(value, key),
          do: Map.update!(value, key, &Path.expand(&1, cwd)),
          else: value
      end)

    if Map.has_key?(wire, "workspace") do
      update_in(wire, ["workspace", "source"], &Path.expand(&1, cwd))
    else
      Map.update!(wire, "tasks", fn tasks ->
        Enum.map(tasks, &Map.update!(&1, "cwd", fn path -> Path.expand(path, cwd) end))
      end)
    end
  end

  @impl true
  def handle_call(:handle, _, %{boot_error: error} = state),
    do: {:stop, :normal, {:error, error}, state}

  def handle_call(:handle, _, state),
    do: {:reply, {:ok, %Execution{pid: self(), run_directory: state.run}}, state}

  def handle_call(:output, _, state), do: {:reply, {:ok, state.tail}, state}

  def handle_call(:close, _, %{result: result} = state) when not is_nil(result),
    do: {:stop, :normal, :ok, state}

  def handle_call(operation, _, %{result: result} = state)
      when operation in [:await, :cancel] and not is_nil(result),
      do: {:reply, result, state}

  def handle_call(operation, from, state) when operation in [:await, :cancel, :close] do
    case if(operation == :await, do: {:ok, state}, else: interrupt(state)) do
      {:ok, state} ->
        caller = elem(from, 0)

        monitor =
          case Map.get(state.waiters, caller) do
            nil -> Process.monitor(caller)
            previous -> previous.monitor
          end

        waiter = %{from: from, operation: operation, monitor: monitor}

        {:noreply,
         %{
           state
           | waiters: Map.put(state.waiters, caller, waiter),
             closing: state.closing or operation == :close
         }}

      {:error, error} ->
        {:reply, {:error, error}, state}
    end
  end

  @impl true
  def handle_info({port, {:data, bytes}}, %{port: port} = state) do
    combined = state.tail <> bytes

    tail =
      if byte_size(combined) > @tail_limit,
        do: :binary.copy(binary_part(combined, byte_size(combined) - @tail_limit, @tail_limit)),
        else: combined

    {:noreply, %{state | tail: tail}}
  end

  def handle_info({port, {:exit_status, status}}, %{port: port} = state),
    do: finish(state, result(state, status))

  def handle_info({:EXIT, port, :normal}, %{port: port} = state), do: {:noreply, state}

  def handle_info({:EXIT, port, reason}, %{port: port} = state),
    do: finish(state, {:error, error(state, :port, reason, nil)})

  def handle_info(
        {:DOWN, monitor, :process, owner, _},
        %{monitor: monitor, owner: owner, boot_error: _} = state
      ),
      do: {:stop, :normal, state}

  def handle_info({:DOWN, monitor, :process, owner, _}, %{monitor: monitor, owner: owner} = state) do
    if state.result do
      {:stop, :normal, state}
    else
      case interrupt(state) do
        {:ok, next} ->
          {:noreply, %{next | closing: true}}

        {:error, _} ->
          # Keep ownership and retry: never close the port while a child may run.
          Process.send_after(self(), :retry_interrupt, 50)
          {:noreply, %{state | closing: true}}
      end
    end
  end

  def handle_info({:DOWN, monitor, :process, caller, _}, %{waiters: waiters} = state) do
    case Map.get(waiters, caller) do
      %{monitor: ^monitor} -> {:noreply, %{state | waiters: Map.delete(waiters, caller)}}
      _ -> {:noreply, state}
    end
  end

  def handle_info(:retry_interrupt, %{result: nil} = state) do
    case interrupt(state) do
      {:ok, next} ->
        {:noreply, next}

      {:error, _} ->
        Process.send_after(self(), :retry_interrupt, 50)
        {:noreply, state}
    end
  end

  def handle_info(_, state), do: {:noreply, state}

  defp interrupt(%{interrupted: true} = state), do: {:ok, state}

  defp interrupt(state) do
    case Port.info(state.port, :os_pid) do
      nil ->
        {:ok, state}

      {:os_pid, pid} ->
        case System.cmd(state.signal_binary, ["-INT", Integer.to_string(pid)],
               stderr_to_stdout: true
             ) do
          {_, 0} ->
            {:ok, %{state | interrupted: true}}

          {_, _} ->
            if Port.info(state.port) == nil,
              do: {:ok, state},
              else: {:error, error(state, :signal, :sigint_failed, nil)}
        end
    end
  rescue
    _ -> {:error, error(state, :signal, :sigint_failed, nil)}
  end

  defp result(state, status) do
    path = Path.join(state.run, "result.json")

    with {:ok, stat} <- File.lstat(path),
         :ok <- report_file(stat),
         {:ok, file} <- File.open(path, [:read, :binary]) do
      bytes =
        try do
          IO.binread(file, @report_limit + 1)
        after
          File.close(file)
        end

      case bytes do
        bytes when is_binary(bytes) and byte_size(bytes) <= @report_limit ->
          case Result.decode(bytes) do
            {:ok, report} ->
              if Enum.map(report.tasks, & &1.id) == state.ids do
                {:ok, %Report{run_directory: state.run, result: report, exit_status: status}}
              else
                {:error, error(state, :decode, :task_ids_mismatch, status)}
              end

            {:error, reason} ->
              {:error, error(state, :decode, reason, status)}
          end

        bytes when is_binary(bytes) ->
          {:error, error(state, :decode, :report_too_large, status)}

        _ ->
          {:error, error(state, :io, :unreadable_report, status)}
      end
    else
      {:error, :report_too_large} -> {:error, error(state, :decode, :report_too_large, status)}
      {:error, reason} -> {:error, error(state, :io, reason, status)}
    end
  end

  defp report_file(%File.Stat{type: :regular, size: size}) when size <= @report_limit, do: :ok
  defp report_file(%File.Stat{type: :regular}), do: {:error, :report_too_large}
  defp report_file(_), do: {:error, :invalid_report_file}

  @impl true
  def terminate(_, %{port: port} = state) when is_port(port) do
    case interrupt(state) do
      {:ok, _} ->
        wait_for_exit(port)

      {:error, _} ->
        if Port.info(port) != nil do
          Process.sleep(50)
          terminate(:cleanup, state)
        end
    end
  end

  def terminate(_, _), do: :ok

  defp wait_for_exit(port) do
    receive do
      {^port, {:exit_status, _}} -> :ok
      {:EXIT, ^port, _} -> :ok
      {^port, {:data, _}} -> wait_for_exit(port)
    after
      50 -> if Port.info(port) == nil, do: :ok, else: wait_for_exit(port)
    end
  end

  defp error(state, kind, reason, status),
    do: %Error{
      kind: kind,
      reason: reason,
      run_directory: state.run,
      exit_status: status,
      diagnostics: state.tail
    }

  defp finish(state, result) do
    Enum.each(state.waiters, fn {_, waiter} ->
      Process.demonitor(waiter.monitor, [:flush])
      GenServer.reply(waiter.from, if(waiter.operation == :close, do: :ok, else: result))
    end)

    state = %{state | result: result, waiters: %{}, port: nil}
    if state.closing, do: {:stop, :normal, state}, else: {:noreply, state}
  end
end
