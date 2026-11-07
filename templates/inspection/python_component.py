"""Code-first WIT and componentize-py adapters. Inspection never imports user code."""
from __future__ import annotations

import ast
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
import subprocess


def wit_name(name: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", name).replace("_", "-").lower()
    if not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*", value):
        raise ValueError(f"Unsupported WIT identifier {name}")
    return value


def inspect_component(source: str) -> tuple[str, str, list[dict]]:
    tree = ast.parse(source)
    classes = {node.name: node for node in tree.body if isinstance(node, ast.ClassDef)}
    aliases = {node.targets[0].id: node.value for node in tree.body if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)}
    imports = {alias.asname or alias.name: alias.name for node in tree.body if isinstance(node, ast.ImportFrom) for alias in node.names}

    def expand(node, seen=()):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return expand(ast.parse(node.value, mode="eval").body, seen)
        if isinstance(node, ast.Name) and node.id in aliases:
            if node.id in seen:
                raise ValueError("Recursive Python type alias")
            return expand(aliases[node.id], (*seen, node.id))
        return node

    def type_name(node):
        node = expand(node)
        if isinstance(node, ast.Constant) and node.value is None:
            return None
        if isinstance(node, ast.Name):
            value = {"str": "string", "int": "s64", "float": "f64", "bool": "bool"}.get(node.id)
            if value:
                return value
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr) and isinstance(node.right, ast.Constant) and node.right.value is None:
            return f"option<{type_name(node.left)}>"
        if isinstance(node, ast.Subscript):
            head = imports.get(ast.unparse(node.value), ast.unparse(node.value)).split(".")[-1]
            if head in ("Optional", "list", "List"):
                return f"{'option' if head == 'Optional' else 'list'}<{type_name(node.slice)}>"
            if head in ("Required", "NotRequired"):
                return type_name(node.slice)
        raise ValueError(f"Unsupported component annotation {ast.unparse(node)}; use concrete annotated scalar, list or optional values")

    declarations, methods, metadata, names = [], [], [], set()
    for fn in tree.body:
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) or fn.name.startswith("_"):
            continue
        if isinstance(fn, ast.AsyncFunctionDef) or fn.decorator_list or fn.args.vararg or fn.args.kwarg or fn.args.defaults or fn.args.kwonlyargs or fn.args.posonlyargs or len(fn.args.args) > 1 or fn.returns is None:
            raise ValueError(f"{fn.name}: export a synchronous annotated function with zero arguments or one typed record")
        name = wit_name(fn.name)
        if name in names:
            raise ValueError(f"Duplicate WIT function {name}")
        names.add(name)
        description = ast.get_docstring(fn)
        fields, constructor = [], ""
        if fn.args.args:
            param = fn.args.args[0]
            annotation = expand(param.annotation)
            record = classes.get(ast.unparse(annotation))
            if not record:
                raise ValueError(f"{fn.name}: input must be a local dataclass or TypedDict")
            dataclass = any(imports.get(ast.unparse(value.func if isinstance(value, ast.Call) else value), ast.unparse(value.func if isinstance(value, ast.Call) else value)).split(".")[-1] == "dataclass" for value in record.decorator_list)
            typed_dict = any(imports.get(ast.unparse(value), ast.unparse(value)).split(".")[-1] == "TypedDict" for value in record.bases)
            if not dataclass and not typed_dict:
                raise ValueError(f"{fn.name}: input must be a dataclass or TypedDict")
            if record.bases and not typed_dict:
                raise ValueError("Flatten inherited input fields before exporting a component")
            total = not any(kw.arg == "total" and isinstance(kw.value, ast.Constant) and kw.value.value is False for kw in record.keywords)
            values = []
            used = set()
            for index, field in enumerate(record.body):
                if not isinstance(field, ast.AnnAssign) or not isinstance(field.target, ast.Name):
                    continue
                original = field.target.id
                label = wit_name(original)
                if label in used:
                    raise ValueError(f"Duplicate WIT field {label}")
                used.add(label)
                ty = type_name(field.annotation)
                required = field.value is None if dataclass else total
                if isinstance(field.annotation, ast.Subscript) and ast.unparse(field.annotation.value).split(".")[-1] == "NotRequired":
                    required = False
                if not required and not ty.startswith("option<"):
                    ty = f"option<{ty}>"
                desc = record.body[index + 1] if index + 1 < len(record.body) else None
                doc = desc.value.value if isinstance(desc, ast.Expr) and isinstance(desc.value, ast.Constant) and isinstance(desc.value.value, str) else None
                fields.append({"name": label, "type": ty, "required": not ty.startswith("option<"), **({"description": doc} if doc else {})})
                access = f"getattr(args, {label.replace('-', '_')!r})"
                if field.value is not None:
                    default = ast.literal_eval(field.value)  # Never evaluate arbitrary default expressions.
                    access = f"({access} if {access} is not None else {default!r})"
                if not required and typed_dict:
                    values.append(f"**({{{original!r}: {access}}} if {access} is not None else {{}})")
                else:
                    values.append(f"{original}={access}")
            constructor = f"native.{record.name}({', '.join(values)})"
        result = type_name(fn.returns)
        record_wit = f"  record {name}-args {{\n" + "\n".join(("    /// " + field["description"].replace("\n", "\n    /// ") + "\n" if field.get("description") else "") + f"    {field['name']}: {field['type']}," for field in fields) + "\n  }\n" if fields else ""
        # Empty records carry no CLI arguments; still construct the native value.
        signature = f"args: {name}-args" if fields else ""
        declarations.append(record_wit + ("  /// " + description.replace("\n", "\n  /// ") + "\n" if description else "") + f"  {name}: func({signature})" + (f" -> {result}" if result else "") + ";")
        call = f"native.{fn.name}({constructor})" if constructor else f"native.{fn.name}()"
        methods.append(f"    def {name.replace('-', '_')}(self{', args' if fields else ''}):\n        return {call}\n")
        metadata.append({"name": name, "inputFormat": "wit", "args": fields, "returnType": result or "unit", **({"description": description} if description else {})})
    if not metadata:
        raise ValueError("Expose at least one public typed function")
    wit = "package fluentci:module@0.1.0;\n\ninterface api {\n" + "\n".join(declarations) + "\n}\n\nworld plugin {\n  import fluentci:runtime/host@0.1.0;\n  export api;\n}\n"
    wrapper = "from wit_world import exports\nimport _fluentci_native as native\n\nclass Api(exports.Api):\n" + "\n".join(methods)
    return wit, wrapper, metadata


def build_component(source: Path, artifact: Path) -> None:
    source, artifact = source.resolve(), artifact.resolve()
    wit, wrapper, metadata = inspect_component(source.read_text())
    output = artifact.parent / ".component-py"
    (output / "wit/deps/runtime").mkdir(parents=True, exist_ok=True)
    (output / "wit/module.wit").write_text(wit)
    shutil.copyfile(source.parent / ".sdk/wit/runtime.wit", output / "wit/deps/runtime/runtime.wit")
    (output / "_fluentci_component.py").write_text(wrapper)
    shutil.copyfile(source, output / "_fluentci_native.py")
    compiler = shutil.which("componentize-py")
    if not compiler:
        raise RuntimeError("componentize-py is required; install the project's Python dependencies")
    subprocess.run([compiler, "-d", str(output / "wit"), "-w", "plugin", "bindings", str(output)], check=True)
    subprocess.run([compiler, "-d", str(output / "wit"), "-w", "plugin", "componentize", "--python-path", str(output), "--python-path", str(source.parent), "_fluentci_component", "-o", str(artifact)], check=True)
    # Append only a root custom section: nested component bytes stay untouched.
    def leb(value):
        encoded = bytearray()
        while value >= 128:
            encoded.append((value & 127) | 128)
            value >>= 7
        encoded.append(value)
        return bytes(encoded)
    payload = json.dumps({"functions": metadata}, separators=(",", ":")).encode()
    if len(payload) > 256 * 1024:
        raise ValueError("Function metadata exceeds 256 KiB")
    key = b"fluentci:metadata"
    payload = leb(len(key)) + key + payload
    data = artifact.read_bytes() + b"\x00" + leb(len(payload)) + payload
    artifact.write_bytes(data)
    artifact.with_name("fluentci.metadata.json").write_text(json.dumps({"sha256": sha256(data).hexdigest(), "functions": metadata}, indent=2) + "\n")
