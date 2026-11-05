defmodule FluentCI.Remote.Connection do
  @enforce_keys [:host]
  defstruct [:host, :user, :identity, port: 22, install: true]

  @type t :: %__MODULE__{
          host: String.t(),
          user: String.t() | nil,
          identity: String.t() | nil,
          port: pos_integer(),
          install: boolean()
        }
end

defmodule FluentCI.Remote do
  @moduledoc "Pure host operation tasks. Provisioning and IO run inside the native DAG."
  alias FluentCI.Host
  alias FluentCI.Remote.Connection
  @type direction :: :upload | :download
  @type action :: :get | :put | :list | :delete
  @type algorithm :: :sha256 | :sha512
  def connection(host), do: %Connection{host: host}
  def task(id, operation, cwd \\ "."), do: Host.primitive_task(id, operation, cwd)
  def os(id, cwd \\ "."), do: task(id, %{kind: "os"}, cwd)
  def arch(id, cwd \\ "."), do: task(id, %{kind: "arch"}, cwd)

  def digest_text(id, algorithm, text, cwd \\ ".") when algorithm in [:sha256, :sha512],
    do:
      task(
        id,
        %{
          kind: "digest",
          algorithm: Atom.to_string(algorithm),
          input: %{source: "text", value: text}
        },
        cwd
      )

  def digest_file(id, algorithm, path, cwd \\ ".") when algorithm in [:sha256, :sha512],
    do:
      task(
        id,
        %{
          kind: "digest",
          algorithm: Atom.to_string(algorithm),
          input: %{source: "file", value: path}
        },
        cwd
      )

  @spec ssh(String.t(), Connection.t(), [String.t()], String.t()) :: FluentCI.Host.Task.t()
  def ssh(id, %Connection{} = connection, command, cwd \\ "."),
    do: task(id, %{kind: "ssh", connection: Map.from_struct(connection), command: command}, cwd)

  for kind <- [:scp, :sftp, :rsync] do
    def unquote(kind)(id, %Connection{} = connection, direction, source, destination, cwd \\ ".")
        when direction in [:upload, :download],
        do:
          task(
            id,
            %{
              kind: unquote(Atom.to_string(kind)),
              connection: Map.from_struct(connection),
              direction: Atom.to_string(direction),
              source: source,
              destination: destination
            },
            cwd
          )
  end

  def ftp(id, url, action, options \\ [], cwd \\ "."),
    do:
      task(
        id,
        Map.merge(Map.new(options), %{kind: "ftp", url: url, action: Atom.to_string(action)}),
        cwd
      )

  def ftps(id, url, action, options \\ [], cwd \\ "."),
    do:
      task(
        id,
        Map.merge(Map.new(options), %{kind: "ftps", url: url, action: Atom.to_string(action)}),
        cwd
      )

  def s3(id, bucket, key, action, options \\ [], cwd \\ "."),
    do:
      task(
        id,
        Map.merge(Map.new(options), %{
          kind: "s3",
          bucket: bucket,
          key: key,
          action: Atom.to_string(action)
        }),
        cwd
      )
end
