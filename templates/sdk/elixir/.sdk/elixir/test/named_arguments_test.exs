defmodule FluentCI.NamedArgumentsTest do
  use ExUnit.Case, async: true
  alias FluentCI.Plugin

  defmodule Inspected do
    use FluentCI.Plugin

    @doc """
    Build source files.
    @param src Source directory.
    """
    defplugin build do
      pipeline("build") |> exec(["builder", argument("src"), argument("jobs", "integer")])
    end
  end

  test "metadata is derived from the declarations used by code generation" do
    exports = Inspected.__fluentci_exports__()
    docs = Inspected.__fluentci_export_docs__()
    [function] = FluentCI.Plugin.Codegen.metadata(exports, docs)
    assert function.name == "build"
    assert function.returnType == "String"
    assert function.description == "Build source files."
    assert Enum.find(function.args, &(&1.name == "src")).description == "Source directory."
    assert Enum.find(function.args, &(&1.name == "jobs")).type == "integer"
    assert FluentCI.Plugin.Codegen.source(exports, docs) =~ "link_section = \"fluentci:metadata\""

    [changed] = FluentCI.Plugin.Codegen.metadata(build: Plugin.argument("jobs", "number"))
    assert changed.args == [%{name: "jobs", type: "number"}]
  end

  test "typed named values compose in a pipeline without host effects" do
    src = Plugin.argument("src", "string")
    count = Plugin.argument("jobs", "integer")
    assert src.name == "src"
    assert count.type == "integer"
    pipeline = Plugin.pipeline("build") |> Plugin.exec(["builder", src, count])
    assert pipeline.steps == [{:exec, ["builder", src, count]}]
    generated = FluentCI.Plugin.Codegen.source(build: pipeline)
    assert generated =~ "serde_json::from_str(&input)"
    assert generated =~ "i32::try_from"
    assert generated =~ "invalid named argument type"
    assert_raise ArgumentError, fn -> Plugin.argument("help", "string") end
    assert_raise ArgumentError, fn -> Plugin.argument("src", "String") end
  end
end

defmodule FluentCI.ComponentGenerationTest do
  use ExUnit.Case, async: true
  alias FluentCI.Plugin

  test "component signatures follow the actual typed DSL declarations" do
    source = FluentCI.Plugin.Component.source(build: Plugin.argument("jobs", "integer"))
    assert source =~ "pub r#jobs: i32"
    assert source =~ "-> Result<String, String>"
    refute source =~ "extism"
    updated = FluentCI.Plugin.Component.source(build: Plugin.argument("jobs", "number"))
    assert updated =~ "pub r#jobs: f64"
  end

  test "components reject untyped raw input" do
    assert_raise ArgumentError, ~r/require named arguments/, fn ->
      FluentCI.Plugin.Component.source(build: Plugin.input())
    end
  end
end
