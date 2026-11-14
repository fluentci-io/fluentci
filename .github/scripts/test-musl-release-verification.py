"""Test ELF verification with generated headers; no binaries are executed."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("musl_verification", Path(__file__).with_name("verify-musl-binary.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MuslVerificationTests(unittest.TestCase):
    def fixture(self, directory, machine=62, kind=1, tag=0):
        data = bytearray(136)
        data[:6] = b"\x7fELF\x02\x01"
        struct.pack_into("<H", data, 18, machine)
        struct.pack_into("<Q", data, 32, 64)
        struct.pack_into("<HH", data, 54, 56, 1)
        struct.pack_into("<I", data, 64, kind)
        struct.pack_into("<Q", data, 72, 120)
        struct.pack_into("<Q", data, 96, 16)
        struct.pack_into("<q", data, 120, tag)
        binary = Path(directory) / "fluentci"
        binary.write_bytes(data)
        return binary

    def test_static_binaries_for_both_architectures(self):
        with tempfile.TemporaryDirectory() as directory:
            for machine, target in [(62, "x86_64"), (183, "aarch64")]:
                for kind in [1, 2]:
                    module.verify(self.fixture(directory, machine, kind), target + "-unknown-linux-musl")

    def test_rejects_interpreters_dependencies_wrong_arch_and_truncation(self):
        with tempfile.TemporaryDirectory() as directory:
            for options in [{"kind": 3}, {"kind": 2, "tag": 1}, {"machine": 183}]:
                with self.subTest(options=options), self.assertRaises(ValueError):
                    module.verify(self.fixture(directory, **options), "x86_64-unknown-linux-musl")
            binary = self.fixture(directory)
            binary.write_bytes(binary.read_bytes()[:90])
            with self.assertRaises(ValueError):
                module.verify(binary, "x86_64-unknown-linux-musl")


if __name__ == "__main__":
    unittest.main()
