"""Archive-verifier regression tests. Fixtures are data, never executed binaries."""
import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

VERIFY = Path(__file__).with_name("verify-bsd-release.py")
TARGET = "x86_64-unknown-netbsd"
TAG = "v0.0.0-test"


class ReleaseVerification(unittest.TestCase):
    def verify(self, *, corrupt=False, unsafe=False, wrong_arch=False, symlink=False, wrong_metadata=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "status").write_text("built\n")
            name = f"fluentci_{TAG}_{TARGET}.tar.gz"
            archive = root / name
            header = bytearray(64)
            header[:6] = b"\x7fELF\x02\x01"
            header[18:20] = b"\xb7\x00" if wrong_arch else b"\x3e\x00"
            metadata_target = "x86_64-unknown-freebsd" if wrong_metadata else TARGET
            entries = {
                "fluentci": bytes(header),
                "BUILD-INFO.txt": f"Target: {metadata_target}\nRelease tag: {TAG}\n".encode(),
                "LICENSE": b"fixture", "README.md": b"fixture",
                "licenses/wasmtime/LICENSE": b"fixture",
                "licenses/extism-openbsd/LICENSE": b"fixture",
                "licenses/superconsole/LICENSE-MIT": b"fixture",
                "licenses/superconsole/LICENSE-APACHE": b"fixture",
            }
            if unsafe:
                entries["../escape"] = b"unsafe"
            with tarfile.open(archive, "w:gz") as package:
                for path, content in entries.items():
                    member = tarfile.TarInfo(path)
                    member.size = len(content)
                    member.mode = 0o755 if path == "fluentci" else 0o644
                    if symlink and path == "fluentci":
                        member.type = tarfile.SYMTYPE
                        member.linkname = "/bin/sh"
                        member.size = 0
                        package.addfile(member)
                    else:
                        package.addfile(member, io.BytesIO(content))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            (root / f"{name}.sha256").write_text(f"{digest}  {name}\n")
            if corrupt:
                with archive.open("ab") as output:
                    output.write(b"corrupted")
            return subprocess.run([sys.executable, str(VERIFY), str(root), TAG, TARGET], capture_output=True, text=True)

    def test_accepts_correct_archive_and_checksum(self):
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_refuses_corrupt_or_unsafe_release_assets(self):
        for case in ["corrupt", "unsafe", "wrong_arch", "symlink", "wrong_metadata"]:
            with self.subTest(case=case):
                result = self.verify(**{case: True})
                self.assertNotEqual(result.returncode, 0, result.stdout)


if __name__ == "__main__":
    unittest.main()
