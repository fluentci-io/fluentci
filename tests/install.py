"""Exercise the installer with local archives and mocked HTTP; never installs globally."""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

INSTALLER = Path(__file__).resolve().parents[1] / "install.sh"


class InstallerTests(unittest.TestCase):
    def run_installer(self, version=None, bad_checksum=False, bad_latest=False):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = b"#!/bin/sh\necho fluentci-test\n"
            archive = root / "release.tar.gz"
            with tarfile.open(archive, "w:gz") as output:
                member = tarfile.TarInfo("fluentci")
                member.size = len(binary)
                member.mode = 0o755
                output.addfile(member, io.BytesIO(binary))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            (root / "checksum").write_text(("0" * 64 if bad_checksum else digest) + "  release.tar.gz\n")
            mock = root / "mock"
            mock.mkdir()
            (mock / "uname").write_text('#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n')
            (mock / "uname").chmod(0o755)
            (mock / "curl").write_text(f"#!{sys.executable}\n" + '''import os, pathlib, shutil, sys
root = pathlib.Path(os.environ["MOCK_ROOT"])
args = sys.argv[1:]
url = next(value for value in args if value.startswith("https://"))
with (root / "requests").open("a") as log: log.write(url + "\\n")
if url.endswith("/latest"):
    print("https://github.com/tsirysndr/fluentci/releases/" + ("latest" if os.environ.get("BAD_LATEST") else "tag/2099.01.01"), end="")
else:
    destination = pathlib.Path(args[args.index("-o") + 1])
    shutil.copyfile(root / ("checksum" if url.endswith(".sha256") else "release.tar.gz"), destination)
''')
            (mock / "curl").chmod(0o755)
            env = {**os.environ, "PATH": str(mock) + ":/usr/bin:/bin:/usr/sbin:/sbin", "MOCK_ROOT": str(root), "FLUENTCI_INSTALL_DIR": str(root / "installed")}
            env.pop("FLUENTCI_VERSION", None)
            if version is not None:
                env["FLUENTCI_VERSION"] = version
            if bad_latest:
                env["BAD_LATEST"] = "1"
            result = subprocess.run(["/bin/sh", str(INSTALLER)], env=env, capture_output=True, text=True)
            installed = root / "installed/fluentci"
            return result, (root / "requests").read_text(), installed.read_bytes() if installed.exists() else None

    def test_defaults_to_latest_release(self):
        result, requests, binary = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("/releases/latest", requests)
        self.assertIn("/download/2099.01.01/fluentci_2099.01.01_x86_64-unknown-linux-gnu.tar.gz", requests)
        self.assertIn(b"fluentci-test", binary)

    def test_preserves_explicit_version(self):
        result, requests, binary = self.run_installer(version="2026.11.04")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("/releases/latest", requests)
        self.assertIn("/download/2026.11.04/", requests)
        self.assertIsNotNone(binary)

    def test_rejects_checksum_mismatch(self):
        result, _, binary = self.run_installer(bad_checksum=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum mismatch", result.stderr)
        self.assertIsNone(binary)

    def test_rejects_unresolved_latest_redirect(self):
        result, _, binary = self.run_installer(bad_latest=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("could not resolve", result.stderr)
        self.assertIsNone(binary)


if __name__ == "__main__":
    unittest.main()
