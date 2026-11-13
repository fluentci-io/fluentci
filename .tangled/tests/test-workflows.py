#!/usr/bin/env python3
"""Check supported Spindle keys, platform coverage, caches and shell syntax."""
from pathlib import Path
import subprocess
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]


class Workflows(unittest.TestCase):
    def test_workflows_have_real_steps_on_almalinux_microvms(self):
        files = sorted((ROOT / ".tangled/workflows").glob("*.yml"))
        self.assertEqual(len(files), 14)
        for path in files:
            with self.subTest(workflow=path.name):
                config = yaml.safe_load(path.read_text())
                self.assertEqual(config["engine"], "microvm")
                self.assertEqual(config["image"], "almalinux10")
                self.assertFalse(set(config) - {"when", "engine", "image", "environment", "cache", "clone", "steps", "runs_on", "audience"})
                self.assertNotIn("release", path.name)
                self.assertTrue(config["steps"])
                self.assertIn("bootstrap-dnf.sh", config["steps"][0]["command"])
                for condition in config["when"]:
                    self.assertTrue(set(condition) <= {"event", "branch", "tag", "types", "paths", "schedule"})
                    if condition["event"] == "push":
                        self.assertEqual(condition["branch"], "main")
                    self.assertNotIn("tag", condition)
                for step in config["steps"]:
                    self.assertTrue(set(step) <= {"name", "command", "environment"})
                    self.assertIn("set -euo pipefail", step["command"])
                    self.assertNotIn("${{", step["command"])
                    self.assertNotIn("--with-deps", step["command"])
                    subprocess.run(["bash", "-n"], input=step["command"], text=True, check=True)
                for cache in config.get("cache", []):
                    for name in cache["paths"]:
                        self.assertNotIn(".tangled-state", name)
                    for name in cache.get("hash", []):
                        self.assertTrue((ROOT / name).is_file(), name)

    def test_every_linux_ci_job_and_component_sdk_is_represented(self):
        github = yaml.safe_load((ROOT / ".github/workflows/components.yml").read_text())
        expected = github["jobs"]["component"]["strategy"]["matrix"]["sdk"]
        actual = [yaml.safe_load(path.read_text())["environment"]["FLUENTCI_COMPONENT_SDK"] for path in (ROOT / ".tangled/workflows").glob("components-*.yml")]
        self.assertEqual(sorted(actual), sorted(expected))
        for name in ["ci", "docs", "landing", "modules", "api", "npm", "nix-build"]:
            self.assertTrue((ROOT / f".tangled/workflows/{name}.yml").is_file())


if __name__ == "__main__":
    unittest.main()
