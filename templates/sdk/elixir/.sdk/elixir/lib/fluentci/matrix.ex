defmodule FluentCI.Matrix.Case do
  @enforce_keys [:key, :value]
  defstruct [:key, :value]
  @type t(a) :: %__MODULE__{key: String.t(), value: a}
end

defmodule FluentCI.Matrix do
  @moduledoc "Pure named cases and bounded products, expanded into ordinary host tasks."
  alias FluentCI.Matrix.Case
  alias FluentCI.Host.Task
  alias FluentCI.Host, as: H
  @max_cases 4096

  def named(name, value), do: %Case{key: component(name), value: value}

  def axis(name, values),
    do: Enum.map(values, &%Case{key: "#{component(name)}=#{component(&1)}", value: &1})

  def product(left, right) do
    if length(left) * length(right) > @max_cases do
      {:error, :too_many_cases}
    else
      {:ok,
       for(a <- left, b <- right, do: %Case{key: "#{a.key},#{b.key}", value: {a.value, b.value}})}
    end
  end

  def include(cases, extra), do: cases ++ extra
  def exclude(cases, predicate), do: Enum.reject(cases, &predicate.(&1.value))

  def matrix(name, cases, build) do
    keys = Enum.map(cases, & &1.key)

    cond do
      not Regex.match?(~r/^[A-Za-z0-9_.-]{1,64}$/, name) ->
        {:error, :invalid_name}

      length(cases) > @max_cases ->
        {:error, :too_many_cases}

      Enum.any?(keys, &(&1 == "" or String.contains?(&1, <<0>>))) or Enum.uniq(keys) != keys ->
        {:error, :duplicate_or_empty_case}

      true ->
        {:ok,
         Enum.map(cases, fn c ->
           %Task{} = task = build.(c.value)
           %{task | data: Map.put(task.data, :id, "#{name}[#{c.key}]")}
         end)}
    end
  end

  def after_jobs(%Task{} = task, parents) do
    dependencies = Map.get(task.data, :needs, []) ++ Enum.map(parents, & &1.data.id)
    H.needs(task, Enum.uniq(dependencies))
  end

  def parallel(tasks, jobs), do: H.plan(tasks) |> H.jobs(jobs)
  defp component(value), do: URI.encode(value, &URI.char_unreserved?/1)
end
