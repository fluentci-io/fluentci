defmodule FluentCI.Host.Plan do
  @moduledoc "Immutable plan value; construct it through FluentCI.Host."
  @enforce_keys [:data]
  defstruct [:data]
  @opaque t :: %__MODULE__{data: map()}
end

defmodule FluentCI.Host.Task do
  @moduledoc "Immutable task value; construct it through FluentCI.Host."
  @enforce_keys [:data]
  defstruct [:data]
  @opaque t :: %__MODULE__{data: map()}
end

defmodule FluentCI.Host do
  @moduledoc """
  Pure, pipe-friendly host execution plans. Builders and `compile/1` perform no
  filesystem, environment, network, package installation, or process operations.
  Compilation validates the wire structure and dependency graph; the engine also
  validates host paths, cache overlaps, resource contracts and platform support.
  """
  alias FluentCI.Host.{Plan, Task}

  @type error ::
          {:invalid_field, list()}
          | {:duplicate_id, String.t()}
          | {:missing_dependency, String.t(), String.t()}
          | {:cycle, String.t()}
          | {:invalid_task, String.t()}

  @spec task(String.t(), String.t(), String.t()) :: Task.t()
  def primitive_task(id, operation, cwd), do: task(id, "", cwd) |> put(:primitive, operation)

  def file_task(id, operation, cwd), do: task(id, "", cwd) |> put(:file_operation, operation)

  def env_file(task, path),
    do: put(task, :env_files, Map.get(task.data, :env_files, []) ++ [path])

  def task(id, program, cwd), do: %Task{data: %{id: id, program: program, cwd: cwd}}
  @spec plan([Task.t()]) :: Plan.t()
  def plan(tasks \\ []),
    do: %Plan{
      data: %{
        version: 1,
        inherit_env: false,
        jobs: 4,
        max_services: 8,
        fail_fast: true,
        tasks: tasks
      }
    }

  @spec add_task(Plan.t(), Task.t()) :: Plan.t()
  def add_task(%Plan{data: data} = plan, task),
    do: %{plan | data: Map.update!(data, :tasks, &(&1 ++ [task]))}

  @spec args(Task.t(), [String.t()]) :: Task.t()
  @spec needs(Task.t(), [String.t()]) :: Task.t()
  @spec env(Task.t(), %{String.t() => String.t()}) :: Task.t()
  @spec resources(Task.t(), [String.t()]) :: Task.t()
  @spec shared_resources(Task.t(), [String.t()]) :: Task.t()
  @spec timeout_ms(Task.t(), pos_integer() | nil) :: Task.t()
  @spec resource_wait_timeout_ms(Task.t(), pos_integer() | nil) :: Task.t()
  @spec package_environment(Task.t(), [map()]) :: Task.t()
  @spec jobs(Plan.t(), pos_integer()) :: Plan.t()
  @spec max_services(Plan.t(), pos_integer()) :: Plan.t()
  @spec fail_fast(Plan.t(), boolean()) :: Plan.t()
  @spec cache_dir(Plan.t(), String.t() | nil) :: Plan.t()
  @spec resource_dir(Plan.t(), String.t() | nil) :: Plan.t()

  for field <- [
        :args,
        :needs,
        :env,
        :resources,
        :shared_resources,
        :timeout_ms,
        :resource_wait_timeout_ms,
        :package_environment
      ] do
    def unquote(field)(%Task{} = task, value), do: put(task, unquote(field), value)
  end

  for field <- [:jobs, :max_services, :fail_fast, :cache_dir, :resource_dir] do
    def unquote(field)(%Plan{} = plan, value), do: put(plan, unquote(field), value)
  end

  @spec workspace(Plan.t(), String.t(), [String.t()]) :: Plan.t()
  def workspace(%Plan{} = plan, source, inputs),
    do: put(plan, :workspace, %{source: source, inputs: inputs})

  @spec cache(Task.t(), [String.t()], [String.t()], String.t(), keyword()) :: Task.t()
  def cache(%Task{} = task, inputs, outputs, toolchain, opts \\ []) do
    put(
      task,
      :cache,
      Map.merge(
        %{inputs: inputs, outputs: outputs, toolchain: toolchain, relocatable: false},
        Map.new(opts)
      )
    )
  end

  # Task-first functions compose naturally with Elixir's pipe operator.
  def retry(%Task{} = task, attempts \\ 3, delay_ms \\ 250),
    do:
      policy(task, :retry, %{
        max_attempts: attempts,
        delay_ms: delay_ms,
        max_delay_ms: 60_000,
        exit_codes: []
      })

  def when_task(%Task{} = task, condition) do
    task = policy(task, :when, Atom.to_string(condition))

    if condition in [:always, :failure] do
      task
      |> timeout_ms(Map.get(task.data, :timeout_ms, 30_000))
      |> resource_wait_timeout_ms(Map.get(task.data, :resource_wait_timeout_ms, 30_000))
    else
      task
    end
  end

  def always(%Task{} = task), do: when_task(task, :always)
  def allow_failure(%Task{} = task, enabled \\ true), do: policy(task, :allow_failure, enabled)
  def artifact(%Task{} = task, name, path), do: named_policy(task, :artifacts, name, path)
  def output(%Task{} = task, name, path), do: named_policy(task, :outputs, name, path)

  def output_env(%Task{} = task, key, %Task{} = producer, name) do
    task = needs(task, Enum.uniq(Map.get(task.data, :needs, []) ++ [producer.data.id]))
    named_policy(task, :bindings, key, %{task: producer.data.id, name: name})
  end

  def resource(%Task{} = task, name),
    do: resources(task, Enum.uniq(Map.get(task.data, :resources, []) ++ [name]))

  defp policy(%Task{data: data} = task, key, value),
    do: %{task | data: Map.put(data, :policy, Map.put(Map.get(data, :policy, %{}), key, value))}

  defp named_policy(%Task{} = task, field, name, value),
    do: policy(task, field, Map.put(get_in(task.data, [:policy, field]) || %{}, name, value))

  @spec probe(String.t(), [String.t()], keyword()) :: map()
  def probe(program, args \\ [], opts \\ []) do
    Map.merge(%{program: program, args: args, interval_ms: 250, timeout_ms: 1000}, Map.new(opts))
  end

  @spec service(Task.t(), map(), keyword()) :: Task.t()
  def service(%Task{} = task, readiness, opts \\ []) do
    put(
      task,
      :service,
      Map.merge(
        %{
          readiness: readiness,
          startup_timeout_ms: 30_000,
          shutdown_timeout_ms: 5000,
          failure_threshold: 3
        },
        Map.new(opts)
      )
    )
  end

  @spec provider(
          :homebrew | :macports | :macports_rust | :freebsd | :netbsd | :openbsd,
          keyword()
        ) :: map()
  def provider(kind, opts \\ []) do
    {manager, backend} =
      case kind do
        :homebrew -> {"homebrew", "native"}
        :macports -> {"macports", "native"}
        :macports_rust -> {"macports", "rust"}
        :freebsd -> {"freebsd", "native"}
        :netbsd -> {"netbsd", "native"}
        :openbsd -> {"openbsd", "native"}
        _ -> {nil, nil}
      end

    Map.merge(%{manager: manager, backend: backend}, Map.new(opts))
  end

  @spec install(String.t(), map(), [String.t()], String.t()) :: Task.t()
  def install(id, provider, packages, cwd) do
    task(id, "", cwd) |> put(:package_install, %{provider: provider, packages: packages})
  end

  defp put(%{data: data} = value, field, nil), do: %{value | data: Map.delete(data, field)}
  defp put(%{data: data} = value, field, entry), do: %{value | data: Map.put(data, field, entry)}

  @doc "Returns protocol-v1 JSON or a structured validation error. No execution occurs."
  @spec compile(Plan.t()) :: {:ok, String.t()} | {:error, error()}
  def compile(%Plan{data: %{tasks: tasks} = data}) when is_list(tasks) do
    if Enum.all?(tasks, &match?(%Task{}, &1)) do
      wire = %{data | tasks: Enum.map(tasks, & &1.data)}

      with :ok <- validate(wire, plan_schema(), []),
           :ok <- contracts(wire.tasks),
           :ok <- graph(wire.tasks) do
        {:ok, JSON.encode!(wire)}
      end
    else
      {:error, {:invalid_field, [:tasks]}}
    end
  end

  def compile(_), do: {:error, {:invalid_field, []}}

  defp provider_schema do
    {:object,
     %{
       manager: {:enum, ["homebrew", "macports", "freebsd", "netbsd", "openbsd"]},
       backend: {:enum, ["native", "rust"]}
     }, %{executable: :nonempty}}
  end

  defp probe_schema do
    {:object, %{program: :nonempty},
     %{args: {:list, :string}, interval_ms: :positive, timeout_ms: :positive}}
  end

  defp task_schema do
    {:object, %{id: :nonempty, program: :string, cwd: :nonempty},
     %{
       primitive: :primitive,
       file_operation: :file_operation,
       env_files: {:list, :nonempty},
       args: {:list, :string},
       needs: {:list, :nonempty},
       env: :environment,
       resources: {:list, :nonempty},
       shared_resources: {:list, :nonempty},
       timeout_ms: :positive,
       resource_wait_timeout_ms: :positive,
       cache:
         {:object,
          %{
            inputs: {:list, :nonempty},
            outputs: {:list, :nonempty},
            toolchain: :nonempty
          }, %{relocatable: :boolean, toolchain_files: {:list, :nonempty}}},
       service:
         {:object, %{readiness: probe_schema()},
          %{
            health: probe_schema(),
            startup_timeout_ms: :positive,
            shutdown_timeout_ms: :positive,
            failure_threshold: :positive
          }},
       policy:
         {:object, %{},
          %{
            when: {:enum, ["success", "failure", "always", "never"]},
            retry:
              {:object, %{max_attempts: :positive, delay_ms: :positive, max_delay_ms: :positive},
               %{exit_codes: {:list, :integer}}},
            allow_failure: :boolean,
            outputs: :environment,
            artifacts: :environment,
            bindings: {:map, {:object, %{task: :nonempty, name: :nonempty}, %{}}}
          }},
       package_install:
         {:object, %{provider: provider_schema(), packages: {:nonempty_list, :package}}, %{}},
       package_environment: {:list, provider_schema()}
     }}
  end

  defp plan_schema do
    {:object,
     %{
       version: {:enum, [1]},
       inherit_env: {:enum, [false]},
       jobs: :positive,
       max_services: :positive,
       fail_fast: :boolean,
       tasks: {:list, task_schema()}
     },
     %{
       cache_dir: :nonempty,
       resource_dir: :nonempty,
       workspace: {:object, %{source: :nonempty, inputs: {:list, :nonempty}}, %{}}
     }}
  end

  defp validate(value, {:object, required, optional}, path)
       when is_map(value) and not is_struct(value) do
    allowed = Map.merge(required, optional)

    cond do
      Enum.any?(Map.keys(required), &(not Map.has_key?(value, &1))) ->
        {:error, {:invalid_field, path}}

      Enum.any?(Map.keys(value), &(not Map.has_key?(allowed, &1))) ->
        {:error, {:invalid_field, path}}

      true ->
        Enum.reduce_while(value, :ok, fn {key, entry}, :ok ->
          case validate(entry, Map.fetch!(allowed, key), path ++ [key]) do
            :ok -> {:cont, :ok}
            error -> {:halt, error}
          end
        end)
    end
  end

  defp validate(value, {:nonempty_list, rule}, path) when is_list(value) and value != [],
    do: validate(value, {:list, rule}, path)

  defp validate(value, {:list, rule}, path) when is_list(value) do
    value
    |> Enum.with_index()
    |> Enum.reduce_while(:ok, fn {entry, index}, :ok ->
      case validate(entry, rule, path ++ [index]) do
        :ok -> {:cont, :ok}
        error -> {:halt, error}
      end
    end)
  end

  defp validate(value, :file_operation, path) when is_map(value) do
    case FluentCI.Files.schema(Map.get(value, :op)) do
      nil -> {:error, {:invalid_field, path}}
      schema -> validate(value, schema, path)
    end
  end

  defp validate(value, {:enum, allowed}, path), do: checked(value in allowed, path)

  defp validate(value, {:map, rule}, path) when is_map(value) and not is_struct(value) do
    Enum.reduce_while(value, :ok, fn {key, entry}, :ok ->
      case if(text?(key) and key != "",
             do: validate(entry, rule, path ++ [key]),
             else: {:error, {:invalid_field, path}}
           ) do
        :ok -> {:cont, :ok}
        error -> {:halt, error}
      end
    end)
  end

  defp validate(value, :integer, path), do: checked(is_integer(value), path)

  defp validate(value, :positive, path),
    do: checked(is_integer(value) and value > 0 and value <= 18_446_744_073_709_551_615, path)

  defp validate(value, :package, path),
    do:
      checked(text?(value) and Regex.match?(~r/\A[A-Za-z0-9][A-Za-z0-9@\/._+\-]*\z/, value), path)

  defp validate(value, :boolean, path), do: checked(is_boolean(value), path)
  defp validate(value, :string, path), do: checked(text?(value), path)
  defp validate(value, :nonempty, path), do: checked(text?(value) and value != "", path)

  defp validate(value, :environment, path) when is_map(value) and not is_struct(value) do
    checked(
      Enum.all?(value, fn {key, entry} ->
        text?(key) and key != "" and not String.contains?(key, "=") and text?(entry)
      end),
      path
    )
  end

  defp validate(%{kind: kind}, :primitive, path),
    do:
      checked(
        kind in ["os", "arch", "digest", "ssh", "scp", "sftp", "rsync", "ftp", "ftps", "s3"],
        path
      )

  defp validate(_, _, path), do: {:error, {:invalid_field, path}}
  defp checked(true, _), do: :ok
  defp checked(false, path), do: {:error, {:invalid_field, path}}

  defp text?(value),
    do: is_binary(value) and String.valid?(value) and not String.contains?(value, <<0>>)

  defp contracts(tasks) do
    Enum.reduce_while(tasks, :ok, fn task, :ok ->
      install = Map.has_key?(task, :package_install)

      valid =
        if install do
          task.program == "" and Map.get(task, :args, []) == [] and
            not Map.has_key?(task, :cache) and not Map.has_key?(task, :service) and
            Map.get(task, :package_environment, []) == []
        else
          if Map.has_key?(task, :file_operation) or Map.has_key?(task, :primitive) do
            task.program == "" and Map.get(task, :args, []) == [] and
              not Map.has_key?(task, :service) and Map.get(task, :package_environment, []) == []
          else
            task.program != "" and
              not (Map.has_key?(task, :cache) and Map.has_key?(task, :service))
          end
        end

      providers =
        Map.get(task, :package_environment, []) ++
          if(install, do: [task.package_install.provider], else: [])

      valid =
        valid and Enum.all?(providers, &(&1.backend == "native" or &1.manager == "macports"))

      if valid, do: {:cont, :ok}, else: {:halt, {:error, {:invalid_task, task.id}}}
    end)
  end

  defp graph(tasks) do
    by_id = Map.new(tasks, &{&1.id, &1})
    duplicate = Enum.frequencies_by(tasks, & &1.id) |> Enum.find(fn {_, count} -> count > 1 end)

    missing =
      for task <- tasks,
          dep <- Map.get(task, :needs, []),
          not Map.has_key?(by_id, dep),
          do: {task.id, dep}

    cond do
      duplicate ->
        {:error, {:duplicate_id, elem(duplicate, 0)}}

      missing != [] ->
        {id, dep} = hd(missing)
        {:error, {:missing_dependency, id, dep}}

      true ->
        Enum.reduce_while(tasks, {:ok, MapSet.new()}, fn task, {:ok, visited} ->
          case visit(task.id, by_id, MapSet.new(), visited) do
            {:ok, next} -> {:cont, {:ok, next}}
            error -> {:halt, error}
          end
        end)
        |> case do
          {:ok, _} -> :ok
          error -> error
        end
    end
  end

  defp visit(id, tasks, visiting, visited) do
    cond do
      MapSet.member?(visiting, id) ->
        {:error, {:cycle, id}}

      MapSet.member?(visited, id) ->
        {:ok, visited}

      true ->
        Enum.reduce_while(Map.get(tasks[id], :needs, []), {:ok, visited}, fn dep, {:ok, seen} ->
          case visit(dep, tasks, MapSet.put(visiting, id), seen) do
            {:ok, next} -> {:cont, {:ok, next}}
            error -> {:halt, error}
          end
        end)
        |> case do
          {:ok, next} -> {:ok, MapSet.put(next, id)}
          error -> error
        end
    end
  end
end
