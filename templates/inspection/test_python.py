"""Pure source-inspection tests; never invokes a FluentCI job."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest


source = Path(__file__).resolve().parents[1] / "sdk/python/.sdk/python/src/fluentci/inspection.py"
if not source.is_file():
    source = Path(__file__).resolve().parents[1] / "python/src/fluentci/inspection.py"
spec = importlib.util.spec_from_file_location("fluentci_inspection", source)
inspection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspection)


class InspectionTests(unittest.TestCase):
    def test_source_fields_and_return_annotations_are_regenerated(self):
        source = '''
import extism
from dataclasses import dataclass
@dataclass
class Args:
    src: str
    "Source directory."
    jobs: int = 1
@extism.plugin_fn
def build(args: Args) -> str:
    """Build source files."""
    return render(args)
@extism.plugin_fn
def render(args: Args) -> str:
    return args.src + ":" + str(args.jobs)
'''
        functions, generated, native_source = inspection.inspect_entry(source)
        self.assertEqual(functions[0]["returnType"], "str")
        self.assertEqual(functions[0]["args"], [
            {"name": "src", "type": "string", "description": "Source directory."},
            {"name": "jobs", "type": "integer", "required": False},
        ])
        revised, _, _ = inspection.inspect_entry(source.replace("jobs: int", "jobs: float"))
        self.assertEqual(revised[0]["args"][1]["type"], "number")
        stub = types.ModuleType("extism")
        stub.plugin_fn = lambda function: function
        stub.input_str = lambda: '{"src":"demo"}'
        output = []
        stub.output_str = output.append
        previous = sys.modules.get("extism")
        sys.modules["extism"] = stub
        native = types.ModuleType("_fluentci_native")
        sys.modules[native.__name__] = native
        try:
            exec(compile(native_source, "native.py", "exec"), native.__dict__)
            namespace = {"__name__": "fixture"}
            exec(compile(generated, "fixture.py", "exec"), namespace)
            namespace["build"]()
            self.assertEqual(output, ["demo:1"])
            stub.input_str = lambda: '{"src":"demo","jobs":true}'
            with self.assertRaisesRegex(ValueError, "jobs expects integer"):
                namespace["build"]()
        finally:
            sys.modules.pop(native.__name__, None)
            if previous is None:
                sys.modules.pop("extism", None)
            else:
                sys.modules["extism"] = previous

    def test_unsupported_annotations_fail_instead_of_guessing(self):
        with self.assertRaisesRegex(ValueError, "Unsupported Python input annotation"):
            inspection.inspect_entry('''
import extism
from typing import TypedDict, Any
class Args(TypedDict):
    value: Any
@extism.plugin_fn
def build(args: Args) -> str:
    return str(args)
''')

    def test_zero_argument_legacy_exports_keep_raw_input(self):
        functions, generated, native = inspection.inspect_entry('''
import extism
@extism.plugin_fn
def hello() -> None:
    extism.output_str(extism.input_str())
''')
        self.assertNotIn("args", functions[0])
        self.assertIn("extism.output_str(extism.input_str())", native)
        self.assertIn("_fluentci_native.hello()", generated)


if __name__ == "__main__":
    unittest.main()
