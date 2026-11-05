#!/usr/bin/env python3
"""Check shared engine/SDK sources, or copy them to the sibling with --write.

Does not copy build output or overwrite the CLI's local integration wrapper.
"""

import argparse
import re
from pathlib import Path
import shutil
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--engine", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    sibling = (args.engine or root.parent / "fluentci-engine").resolve()
    if not (sibling / "Cargo.toml").is_file():
        parser.error(f"engine checkout not found: {sibling}")
    mappings = [
        (root / "engine/crates" / name, sibling / "crates" / name)
        for name in sorted(path.name for path in (root / "engine/crates").iterdir() if path.is_dir() and path.name != "cli")
    ]
    mappings.append((root / "engine/crates/cli/src", sibling / "crates/cli/src"))
    mappings.append((root / "engine/AGENTS.md", sibling / "AGENTS.md"))
    mappings.append((root / "engine/README.md", sibling / "README.md"))
    for name in ("src/content/line.rs", "src/superconsole.rs", "src/testing.rs"):
        relative = Path("vendor/superconsole") / name
        mappings.append((root / "engine" / relative, sibling / relative))
    for language in ("typescript", "python", "gleam", "rescript", "elixir", "clojurescript", "purescript"):
        source = root / "templates/sdk" / language / ".sdk" / language
        for directory in ("src", "lib", "dev", "typings"):
            if (source / directory).is_dir():
                mappings.append((source / directory, sibling / "sdk" / language / directory))
        if language == "gleam":
            mappings.append((source / "gleam.toml", sibling / "sdk/gleam/gleam.toml"))
        if language == "purescript":
            mappings.append((source / "spago.yaml", sibling / "sdk/purescript/spago.yaml"))
    differing = []
    # The CLI manifest has a local library wrapper. Synchronize only its package
    # version, preserving each repository's integration-specific manifest fields.
    source_manifest = root / "engine/crates/cli/Cargo.toml"
    target_manifest = sibling / "crates/cli/Cargo.toml"
    pattern = r'^version\s*=\s*"([^\"]+)"'
    expected = re.search(pattern, source_manifest.read_text(), re.MULTILINE).group(1)
    target_text = target_manifest.read_text()
    actual = re.search(pattern, target_text, re.MULTILINE).group(1)
    if actual != expected:
        differing.append("crates/cli/Cargo.toml (package version)")
        if args.write:
            target_manifest.write_text(re.sub(pattern, f'version = "{expected}"', target_text, count=1, flags=re.MULTILINE))
    for source, destination in mappings:
        files = sorted(source.rglob("*")) if source.is_dir() else [source]
        for file in files:
            if file in {root / "engine/crates/cli/src/lib.rs", root / "engine/crates/ext/Cargo.toml"}:
                continue
            if not file.is_file() or any(part in {"__pycache__", "node_modules", "target", ".git"} for part in file.parts):
                continue
            target = destination / file.relative_to(source) if source.is_dir() else destination
            if target.is_file() and file.read_bytes() == target.read_bytes():
                continue
            differing.append(str(target.relative_to(sibling)))
            if args.write:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, target)
    if differing:
        print("\n".join(differing))
    print(f"{'Synchronized' if args.write else 'Found'} {len(differing)} differing shared files.")
    return 0 if args.write or not differing else 1


if __name__ == "__main__":
    sys.exit(main())
