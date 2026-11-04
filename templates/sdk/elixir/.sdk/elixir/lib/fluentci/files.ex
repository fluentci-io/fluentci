defmodule FluentCI.Files do
  @moduledoc "Pure native filesystem tasks. Query values are returned in file_result."
  alias FluentCI.Host
  def env_file(task, path), do: Host.env_file(task, path)

  def read_text(id, path, limit_bytes, cwd \\ "."),
    do: Host.file_task(id, %{op: "read_text", path: path, limit_bytes: limit_bytes}, cwd)

  def read_bytes(id, path, limit_bytes, cwd \\ "."),
    do: Host.file_task(id, %{op: "read_bytes", path: path, limit_bytes: limit_bytes}, cwd)

  def write_text(id, path, text, overwrite, cwd \\ "."),
    do: Host.file_task(id, %{op: "write_text", path: path, text: text, overwrite: overwrite}, cwd)

  def write_bytes(id, path, bytes, overwrite, cwd \\ "."),
    do:
      Host.file_task(
        id,
        %{
          op: "write_bytes",
          path: path,
          bytes: if(is_binary(bytes), do: :binary.bin_to_list(bytes), else: bytes),
          overwrite: overwrite
        },
        cwd
      )

  def copy_file(id, source, destination, overwrite, cwd \\ "."),
    do:
      Host.file_task(
        id,
        %{op: "copy_file", source: source, destination: destination, overwrite: overwrite},
        cwd
      )

  def copy_tree(id, source, destination, overwrite, cwd \\ "."),
    do:
      Host.file_task(
        id,
        %{op: "copy_tree", source: source, destination: destination, overwrite: overwrite},
        cwd
      )

  def move(id, source, destination, overwrite, cwd \\ "."),
    do:
      Host.file_task(
        id,
        %{op: "move", source: source, destination: destination, overwrite: overwrite},
        cwd
      )

  def mkdir(id, path, parents, cwd \\ "."),
    do: Host.file_task(id, %{op: "mkdir", path: path, parents: parents}, cwd)

  def remove(id, path, recursive, missing_ok, cwd \\ "."),
    do:
      Host.file_task(
        id,
        %{op: "remove", path: path, recursive: recursive, missing_ok: missing_ok},
        cwd
      )

  def stat(id, path, cwd \\ "."), do: Host.file_task(id, %{op: "stat", path: path}, cwd)
  def exists(id, path, cwd \\ "."), do: Host.file_task(id, %{op: "exists", path: path}, cwd)
  def list(id, path, cwd \\ "."), do: Host.file_task(id, %{op: "list", path: path}, cwd)
  def glob(id, pattern, cwd \\ "."), do: Host.file_task(id, %{op: "glob", pattern: pattern}, cwd)
  def hash(id, path, cwd \\ "."), do: Host.file_task(id, %{op: "hash", path: path}, cwd)

  def chmod(id, path, mode, cwd \\ "."),
    do: Host.file_task(id, %{op: "chmod", path: path, mode: mode}, cwd)

  def symlink(id, target, path, cwd \\ "."),
    do: Host.file_task(id, %{op: "symlink", target: target, path: path}, cwd)

  def schema("read_text"),
    do: {:object, %{op: {:enum, ["read_text"]}, path: :string, limit_bytes: :integer}, %{}}

  def schema("read_bytes"),
    do: {:object, %{op: {:enum, ["read_bytes"]}, path: :string, limit_bytes: :integer}, %{}}

  def schema("write_text"),
    do:
      {:object, %{op: {:enum, ["write_text"]}, path: :string, text: :string, overwrite: :boolean},
       %{}}

  def schema("write_bytes"),
    do:
      {:object,
       %{
         op: {:enum, ["write_bytes"]},
         path: :string,
         bytes: {:list, :integer},
         overwrite: :boolean
       }, %{}}

  def schema("copy_file"),
    do:
      {:object,
       %{op: {:enum, ["copy_file"]}, source: :string, destination: :string, overwrite: :boolean},
       %{}}

  def schema("copy_tree"),
    do:
      {:object,
       %{op: {:enum, ["copy_tree"]}, source: :string, destination: :string, overwrite: :boolean},
       %{}}

  def schema("move"),
    do:
      {:object,
       %{op: {:enum, ["move"]}, source: :string, destination: :string, overwrite: :boolean}, %{}}

  def schema("mkdir"),
    do: {:object, %{op: {:enum, ["mkdir"]}, path: :string, parents: :boolean}, %{}}

  def schema("remove"),
    do:
      {:object,
       %{op: {:enum, ["remove"]}, path: :string, recursive: :boolean, missing_ok: :boolean}, %{}}

  def schema("stat"), do: {:object, %{op: {:enum, ["stat"]}, path: :string}, %{}}
  def schema("exists"), do: {:object, %{op: {:enum, ["exists"]}, path: :string}, %{}}
  def schema("list"), do: {:object, %{op: {:enum, ["list"]}, path: :string}, %{}}
  def schema("glob"), do: {:object, %{op: {:enum, ["glob"]}, pattern: :string}, %{}}
  def schema("hash"), do: {:object, %{op: {:enum, ["hash"]}, path: :string}, %{}}

  def schema("chmod"),
    do: {:object, %{op: {:enum, ["chmod"]}, path: :string, mode: :integer}, %{}}

  def schema("symlink"),
    do: {:object, %{op: {:enum, ["symlink"]}, target: :string, path: :string}, %{}}

  def schema(_), do: nil
end
