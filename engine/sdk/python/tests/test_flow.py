import unittest

from fluentci.flow import Pipeline, pipeline


class FlowBuilderTests(unittest.TestCase):
    def test_named_operations_chain_without_execution_or_mutating_branches(self) -> None:
        calls: list[str] = []

        def operation(source: Pipeline[None], args: dict[str, str]) -> Pipeline[str]:
            def execute(values: dict[str, str]) -> str:
                calls.append(values["label"])
                return values["label"]
            return source.module("tool.build", args, execute)

        original = pipeline("ci").workdir(".")
        composed = original.pipe(operation, {"label": "build"}).exec("echo", "done")
        self.assertEqual(calls, [])
        self.assertEqual(len(original.steps), 1)
        self.assertEqual([step[0] for step in composed.steps], ["workdir", "module", "exec"])
        self.assertEqual(composed.steps[1][3](composed.steps[1][2]), "build")
        self.assertEqual(calls, ["build"])
