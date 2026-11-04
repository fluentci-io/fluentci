"""Verify a copied-back BSD release archive before artifact/release upload."""
import hashlib
from pathlib import Path
import re
import sys
import tarfile

root, tag, target = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
if not re.fullmatch(r"[A-Za-z0-9._+\-]+", tag):
    raise SystemExit("Unsafe release tag")
if target not in {"x86_64-unknown-freebsd", "x86_64-unknown-netbsd", "x86_64-unknown-openbsd"}:
    raise SystemExit("Unsupported release target")
if (root / "status").read_text().strip() != "built":
    raise SystemExit("Release was not marked built")
name = f"fluentci_{tag}_{target}.tar.gz"
archive = root / name
with archive.open("rb") as source:
    digest = hashlib.file_digest(source, "sha256").hexdigest()
if (root / f"{name}.sha256").read_text() != f"{digest}  {name}\n":
    raise SystemExit("Archive SHA-256 mismatch")
with tarfile.open(archive, "r:gz") as package:
    members = package.getmembers()
    names = [m.name.rstrip("/") for m in members]
    if len(names) != len(set(names)):
        raise SystemExit("Duplicate archive entries")
    for member in members:
        if member.name.startswith("/") or ".." in Path(member.name).parts or not (member.isfile() or member.isdir()):
            raise SystemExit("Unsafe archive entry")
    binary = package.getmember("fluentci")
    if not binary.isfile() or not binary.mode & 0o111 or binary.size < 64:
        raise SystemExit("Missing executable")
    with package.extractfile(binary) as executable:
        header = executable.read(20)
    if header[:6] != b"\x7fELF\x02\x01" or header[18:20] != b"\x3e\x00":
        raise SystemExit("Expected a native x86_64 ELF binary")
    with package.extractfile("BUILD-INFO.txt") as source:
        info = source.read().decode("utf-8")
    if f"Target: {target}\n" not in info or f"Release tag: {tag}\n" not in info:
        raise SystemExit("Build metadata does not match artifact")
    for required in ["LICENSE", "README.md", "licenses/wasmtime/LICENSE", "licenses/extism-openbsd/LICENSE",
                     "licenses/superconsole/LICENSE-MIT", "licenses/superconsole/LICENSE-APACHE"]:
        if not package.getmember(required).isfile():
            raise SystemExit(f"Missing release file: {required}")
print(f"Verified {name} ({digest})")
