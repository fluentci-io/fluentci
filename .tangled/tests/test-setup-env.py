#!/usr/bin/env python3
"""Validate Spindle's setup handoff without installing tools or running FluentCI."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("spindle_setup", ROOT / ".tangled/scripts/setup-env.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class SetupEnvironment(unittest.TestCase):
    def result(self, bin_dir="/tools/rust/bin", environment=None):
        return {"tool": "rust", "version": "stable", "bin-dir": bin_dir, "environment": environment or []}

    def test_updates_preserve_prior_tool_variables_and_path_priority(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            bridge.export(self.result(environment=[{"name": "CARGO_HOME", "value": "/tools/rust/cargo"}]), {"PATH": "/usr/bin:/bin"}, state)
            bridge.export(self.result("/tools/node/bin", [{"name": "JAVA_HOME", "value": "/tools/java"}]), {"PATH": "/tools/rust/bin:/usr/bin:/bin"}, state)
            values = json.loads((state / "environment.json").read_text())
            self.assertEqual(values["CARGO_HOME"], "/tools/rust/cargo")
            self.assertEqual(values["JAVA_HOME"], "/tools/java")
            self.assertEqual(values["PATH"], "/tools/node/bin:/tools/rust/bin:/usr/bin:/bin")

    def test_shell_exports_preserve_literal_values_and_are_private(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            sentinel = state / "must-not-exist"
            value = f"literal ' \" $(touch {sentinel}) `touch {sentinel}`\nsecond line"
            bridge.export(self.result(environment=[{"name": "TOOL_SETTING", "value": value}]), {"PATH": "/usr/bin:/bin"}, state)
            script = state / "environment.sh"
            result = subprocess.run(["bash", "-c", 'source "$1"; python3 -c \'import os,json; print(json.dumps(os.environ["TOOL_SETTING"]))\'', "bash", str(script)], text=True, capture_output=True, check=True)
            self.assertEqual(json.loads(result.stdout), value)
            self.assertFalse(sentinel.exists())
            self.assertEqual(script.stat().st_mode & 0o777, 0o600)
            self.assertEqual((state / "environment.json").stat().st_mode & 0o777, 0o600)

    def test_invalid_or_reserved_exports_never_create_handoff_files(self):
        invalid = [self.result("relative")]
        for name in ["TANGLED_SHA", "SPINDLE_SECRET", "FLUENTCI_SPINDLE_ROOT", "BASH_ENV", "ENV", "BAD-NAME"]:
            invalid.append(self.result(environment=[{"name": name, "value": "unsafe"}]))
        for result in invalid:
            with tempfile.TemporaryDirectory() as temporary, self.subTest(result=result):
                state = Path(temporary) / "state"
                with self.assertRaises(ValueError):
                    bridge.export(result, {"PATH": "/usr/bin:/bin"}, state)
                self.assertFalse(state.exists())


if __name__ == "__main__":
    unittest.main()
