defmodule Mix.Tasks.Fluentci.Plugin.Build do
  use Mix.Task
  @shortdoc "Compile a FluentCI Elixir DSL module into an Extism Wasm plugin"
  @moduledoc """
  mix fluentci.plugin.build MyPlugin --output dist/plugin.wasm
  Requires Rust, the wasm32-unknown-unknown target, and a compatible FluentCI engine.
  Only the FluentCI.Plugin DSL subset is compiled; no BEAM runtime is embedded.
  """
  @impl Mix.Task
  def run(arguments) do
    {options, modules, invalid} =
      OptionParser.parse(arguments, strict: [output: :string, pdk_path: :string])

    if invalid != [] or length(modules) != 1,
      do: Mix.raise("usage: mix fluentci.plugin.build Module --output plugin.wasm")

    Mix.Task.run("compile")
    module = Module.concat([hd(modules)])

    unless Code.ensure_loaded?(module) and function_exported?(module, :__fluentci_exports__, 0),
      do: Mix.raise("#{inspect(module)} must use FluentCI.Plugin")

    docs =
      if function_exported?(module, :__fluentci_export_docs__, 0),
        do: module.__fluentci_export_docs__(),
        else: %{}

    source = FluentCI.Plugin.Codegen.source(module.__fluentci_exports__(), docs)
    directory = Path.expand(Path.join([".fluentci", "plugins", Atom.to_string(module)]))
    File.mkdir_p!(Path.join(directory, "src"))
    File.write!(Path.join(directory, "src/lib.rs"), source)

    dependency =
      case options[:pdk_path] do
        nil -> "fluentci-pdk = \"=0.2.6\""
        path -> "fluentci-pdk = { path = #{inspect(Path.expand(path))}, version = \"0.2.6\" }"
      end

    manifest = """
    [package]
    name = "fluentci_elixir_plugin"
    version = "0.1.0"
    edition = "2021"
    publish = false
    [lib]
    crate-type = ["cdylib"]
    [dependencies]
    extism-pdk = "=1.4.1"
    serde_json = "1.0"
    #{dependency}
    [workspace]
    """

    manifest_path = Path.join(directory, "Cargo.toml")
    changed = File.read(manifest_path) != {:ok, manifest}
    File.write!(manifest_path, manifest)
    environment = [{"CARGO_TARGET_DIR", Path.join(directory, "target")}]

    if changed or not File.exists?(Path.join(directory, "Cargo.lock")) do
      command!(["generate-lockfile", "--manifest-path", manifest_path], environment)
    end

    command!(
      [
        "build",
        "--release",
        "--locked",
        "--target",
        "wasm32-unknown-unknown",
        "--manifest-path",
        manifest_path
      ],
      environment
    )

    artifact =
      Path.join(directory, "target/wasm32-unknown-unknown/release/fluentci_elixir_plugin.wasm")

    output = Path.expand(options[:output] || "dist/plugin.wasm")
    File.mkdir_p!(Path.dirname(output))
    File.cp!(artifact, output)

    metadata = %{
      sha256: :crypto.hash(:sha256, File.read!(output)) |> Base.encode16(case: :lower),
      functions: FluentCI.Plugin.Codegen.metadata(module.__fluentci_exports__(), docs)
    }

    File.write!(Path.join(Path.dirname(output), "fluentci.metadata.json"), JSON.encode!(metadata))
    Mix.shell().info("Built #{output}")
  end

  defp command!(arguments, environment) do
    {output, status} = System.cmd("cargo", arguments, env: environment, stderr_to_stdout: true)
    Mix.shell().info(output)
    if status != 0, do: Mix.raise("Cargo failed with exit status #{status}")
  end
end
