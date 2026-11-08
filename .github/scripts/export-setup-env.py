#!/usr/bin/env python3
"""Persist a setup component's typed result for subsequent GitHub Actions steps."""

import json
import os
from pathlib import Path
import re
import sys
import uuid


def setup_result(text):
    decoder = json.JSONDecoder()
    # Host command logs may precede the component's final JSON return value.
    for match in reversed(list(re.finditer(r"(?m)^\s*\{", text))):
        try:
            value, end = decoder.raw_decode(text, match.end() - 1)
        except json.JSONDecodeError:
            continue
        if not text[end:].strip() and isinstance(value, dict) and "environment" in value:
            return value
    raise ValueError("Setup module did not return a typed environment result")


def export(result, environ):
    bin_dir = result.get("bin-dir", result.get("binDir"))
    if not isinstance(bin_dir, str) or not os.path.isabs(bin_dir) or any(c in bin_dir for c in "\r\n\0"):
        raise ValueError("Setup module returned an invalid bin-dir")
    variables = result["environment"]
    if not isinstance(variables, list):
        raise ValueError("Setup environment must be a list of name/value records")
    values = {}
    for variable in variables:
        name, value = variable.get("name"), variable.get("value")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError("Invalid setup environment variable name")
        if not isinstance(value, str) or "\0" in value or name in values:
            raise ValueError("Invalid or duplicate setup environment value")
        if name.startswith(("GITHUB_", "RUNNER_")) or name == "NODE_OPTIONS":
            raise ValueError("Setup cannot replace reserved GitHub Actions variables")
        values[name] = value
    current_paths = environ.get("PATH", "").split(os.pathsep)
    paths = [bin_dir]
    for path in values.pop("PATH", "").split(os.pathsep):
        if not path or path in current_paths or path in paths:
            continue
        if not os.path.isabs(path) or any(c in path for c in "\r\n\0"):
            raise ValueError("Invalid setup PATH entry")
        paths.append(path)
    # Validate both destinations before writing either file.
    path_file = Path(environ["GITHUB_PATH"])
    env_file = Path(environ["GITHUB_ENV"])
    with path_file.open("a", encoding="utf-8") as output:
        # Actions prepends the last line first; preserve the installer's priority.
        output.write("".join(path + "\n" for path in reversed(paths)))
    with env_file.open("a", encoding="utf-8") as output:
        for name, value in values.items():
            delimiter = "fluentci_" + uuid.uuid4().hex
            while delimiter in value:
                delimiter = "fluentci_" + uuid.uuid4().hex
            output.write(f"{name}<<{delimiter}\n{value}\n{delimiter}\n")


def main():
    try:
        result = setup_result(sys.stdin.read())
        export(result, os.environ)
        print(f"Configured {result.get('tool', 'tool')} {result.get('version', '')}", file=sys.stderr)
    except (ValueError, KeyError, TypeError, AttributeError, OSError) as error:
        sys.exit(f"Could not export setup environment: {error}")


if __name__ == "__main__":
    main()
