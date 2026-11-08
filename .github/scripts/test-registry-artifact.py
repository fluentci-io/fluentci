#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("registry_artifact", Path(__file__).with_name("registry-artifact.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Response(io.BytesIO):
    def geturl(self):
        return "https://example.com/plugin.wasm"


class RegistryArtifacts(unittest.TestCase):
    def fixture(self, wasm, size=None, digest=None):
        calls = []
        package = {"name": "setup-node", "version": "0.2.0", "size": len(wasm) if size is None else size, "sha256": digest or hashlib.sha256(wasm).hexdigest(), "url": "https://example.com/plugin.wasm"}
        def fetch(request, timeout):
            self.assertEqual(request.get_header("User-agent"), module.USER_AGENT)
            url = request.full_url
            calls.append(url)
            return Response(json.dumps({"package":package}).encode() if "getPackage" in url else wasm)
        return fetch, calls

    def test_accepts_components_and_core_modules_and_reuses_verified_cache(self):
        for magic in module.MAGIC:
            with self.subTest(magic=magic), tempfile.TemporaryDirectory() as directory:
                fetch, calls = self.fixture(magic)
                path = module.resolve("setup-node@v0.2.0", directory, fetch)
                self.assertEqual(path.read_bytes(), magic)
                self.assertEqual(len(calls), 2)
                self.assertEqual(module.resolve("setup-node@0.2.0", directory, fetch), path)
                self.assertEqual(len(calls), 3, "warm artifact should not download again")
                path.write_bytes(b"corrupt!")
                module.resolve("setup-node@v0.2.0", directory, fetch)
                self.assertEqual(path.read_bytes(), magic)
                self.assertEqual(len(calls), 5)

    def test_rejects_wrong_hash_and_oversized_or_non_wasm_downloads_without_leaving_files(self):
        for wasm, kwargs in [(module.MAGIC[1], {"digest":"a"*64}), (module.MAGIC[1]+b"extra", {"size":8}), (b"not wasm", {})]:
            with self.subTest(kwargs=kwargs), tempfile.TemporaryDirectory() as directory:
                fetch, _ = self.fixture(wasm, **kwargs)
                with self.assertRaises(ValueError):
                    module.resolve("setup-node@v0.2.0", directory, fetch)
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_requires_exact_official_versions_before_network_access(self):
        def unexpected(*args, **kwargs):
            self.fail("invalid references must not access the registry")
        for reference in ["setup-node", "setup-node@latest", "@evil.example/setup-node@v0.2.0"]:
            with self.assertRaises(ValueError):
                module.resolve(reference, Path("unused"), unexpected)


if __name__ == "__main__":
    unittest.main()
