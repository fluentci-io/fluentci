#!/usr/bin/env python3
"""Test the Actions environment bridge without running FluentCI or installing tools."""

import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("setup_env", Path(__file__).with_name("export-setup-env.py"))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class SetupEnvironment(unittest.TestCase):
    def result(self, environment=None):
        return {"tool": "rust", "version": "stable", "bin-dir": "/tools/rust/bin", "environment": environment or []}

    def test_reads_final_typed_return_after_host_logs(self):
        result = self.result()
        text = 'Installing tool…\n{"unrelated": 1}\n' + json.dumps(result, indent=2) + '\n'
        self.assertEqual(bridge.setup_result(text), result)
        for invalid in ['failed setup', '{}', '{"environment": []}\ntrailing logs']:
            with self.assertRaises(ValueError):
                bridge.setup_result(invalid)

    def test_streams_logs_before_setup_finishes_and_hides_environment_json(self):
        logs = io.StringIO()
        result = self.result([{'name': 'TOOL_SETTING', 'value': 'not a log'}])

        def source():
            yield "copying path '/nix/store/fixture' from cache...\n"
            self.assertIn("copying path", logs.getvalue())
            yield '{"diagnostic": "Nix progress"}\n'
            self.assertIn('Nix progress', logs.getvalue())
            yield "building Cachix...\n"
            self.assertIn("building Cachix", logs.getvalue())
            yield json.dumps(result) + '\n'

        self.assertEqual(bridge.stream_result(source(), logs), result)
        self.assertNotIn('TOOL_SETTING', logs.getvalue())
        self.assertNotIn('not a log', logs.getvalue())

    def test_streams_failures_without_a_typed_result(self):
        logs = io.StringIO()
        with self.assertRaises(ValueError):
            bridge.stream_result(iter(["building...\n", "error: build failed\n"]), logs)
        self.assertEqual(logs.getvalue(), "building...\nerror: build failed\n")

    def test_streams_pretty_json_and_recovers_from_json_like_logs(self):
        logs = io.StringIO()
        result = self.result()
        lines = ['{not JSON}\n', *json.dumps(result, indent=2).splitlines(keepends=True)]
        self.assertEqual(bridge.stream_result(iter(lines), logs), result)
        self.assertEqual(logs.getvalue(), '{not JSON}\n')

    def test_persists_paths_and_tool_environment_without_replacing_runner_path(self):
        with tempfile.TemporaryDirectory() as directory:
            paths, env = Path(directory)/'paths', Path(directory)/'env'
            bridge.export(self.result([
                {"name": "PATH", "value": "/tools/rust/bin:/tools/node/bin:/usr/bin:/bin"},
                {"name": "CARGO_HOME", "value": "/tools/rust/cargo"},
                {"name": "JAVA_HOME", "value": "/tools/java"},
                {"name": "MULTILINE", "value": "first\nEOF\nlast"},
            ]), {"GITHUB_PATH": str(paths), "GITHUB_ENV": str(env), "PATH": "/usr/bin:/bin"})
            self.assertEqual(paths.read_text().splitlines(), ['/tools/node/bin', '/tools/rust/bin'])
            exported = env.read_text()
            self.assertIn('/tools/rust/cargo', exported)
            self.assertIn('/tools/java', exported)
            delimiter = exported.split('MULTILINE<<')[1].splitlines()[0]
            self.assertNotIn(delimiter, 'first\nEOF\nlast')
            self.assertIn(f'first\nEOF\nlast\n{delimiter}\n', exported)
            self.assertNotIn('PATH<<', exported)

    def test_invalid_results_do_not_write_environment_files(self):
        invalid = [
            {**self.result(), 'bin-dir': 'relative'},
            {**self.result(), 'bin-dir': '/bin\nevil'},
            self.result([{'name':'BAD-NAME','value':'x'}]),
            self.result([{'name':'GITHUB_TOKEN','value':'x'}]),
            self.result([{'name':'PATH','value':'relative:/bin'}]),
            self.result([{'name':'PATH','value':'/bin\nevil'}]),
            self.result([{'name':'A','value':'x'},{'name':'A','value':'y'}]),
        ]
        with tempfile.TemporaryDirectory() as directory:
            paths, env = Path(directory)/'paths', Path(directory)/'env'
            for result in invalid:
                with self.subTest(result=result), self.assertRaises(ValueError):
                    bridge.export(result, {'GITHUB_PATH':str(paths), 'GITHUB_ENV':str(env)})
                self.assertFalse(paths.exists())
                self.assertFalse(env.exists())


if __name__ == '__main__':
    unittest.main()
