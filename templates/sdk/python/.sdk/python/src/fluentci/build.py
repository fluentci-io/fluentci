"""Generate guest ABI declarations, then invoke Extism's Python guest compiler."""
from __future__ import annotations

import argparse
import ast
from hashlib import sha256
import os
from pathlib import Path
import shutil
import subprocess
from typing import Sequence
from .inspection import inspect_entry, embed_inspection


def entry_source(source: str, bindings: str) -> str:
    """extism-py scans only the entry AST: all imports must be declared there."""
    user = ast.parse(source)
    futures: list[ast.stmt] = [node for node in user.body if isinstance(node, ast.ImportFrom) and node.module == "__future__"]
    user.body = [node for node in user.body if node not in futures]
    imports = ast.parse(bindings)
    names: list[str] = []
    for node in imports.body:
        if isinstance(node, ast.FunctionDef):
            original = node.name
            names.append(original)
            node.name = "_fluentci_" + original
            # Normalize annotations before import_fn sees them, including when
            # a typed plugin opts into `from __future__ import annotations`.
            node.decorator_list.append(ast.Name(id="_fluentci_annotations", ctx=ast.Load()))
    normalize = """import extism
import sys as _fluentci_sys
import types as _fluentci_types

def _fluentci_annotations(function):
    if 'return' in function.__annotations__:
        function.__annotations__['return'] = str
    return function
"""
    register = "_fluentci_module = _fluentci_types.ModuleType('fluentci._imports')\n"
    register += "\n".join(f"_fluentci_module.{name} = _fluentci_{name}" for name in names)
    register += "\n_fluentci_sys.modules['fluentci._imports'] = _fluentci_module\n"
    parts = [ast.unparse(ast.Module(body=futures, type_ignores=[])), normalize,
             ast.unparse(ast.fix_missing_locations(imports)), register, ast.unparse(user)]
    return "\n\n".join(parts) + "\n"


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Compile a Python FluentCI plugin to Wasm")
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    options = parser.parse_args(argv)
    compiler = shutil.which("extism-py")
    if compiler is None:
        parser.error("extism-py is required; see https://github.com/extism/python-pdk#install-the-compiler")
    source = options.source.resolve()
    output = options.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    generated = output.with_suffix(".entry.py")
    bindings = Path(__file__).with_name("_imports.py").read_text(encoding="utf-8")
    source_text = source.read_text(encoding="utf-8")
    native_module = "_fluentci_native_" + sha256(source_text.encode()).hexdigest()[:16]
    functions, inspected, native_source = inspect_entry(source_text, native_module)
    output.with_name(native_module + ".py").write_text(native_source, encoding="utf-8")
    generated.write_text(entry_source(inspected, bindings), encoding="utf-8")
    environment = dict(os.environ)
    paths = [str(Path(__file__).resolve().parents[1]), str(output.parent), str(source.parent)]
    if environment.get("PYTHONPATH"):
        paths.append(environment["PYTHONPATH"])
    environment["PYTHONPATH"] = os.pathsep.join(paths)
    subprocess.run([compiler, str(generated), "-o", str(output)], env=environment, check=True)
    embed_inspection(output, functions)


if __name__ == "__main__":
    main()
