"""Static Python entrypoint inspection. Importing user code is never required."""
from __future__ import annotations

import ast
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import tempfile


def _name(node: ast.AST | None) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return _name(node.value) + "." + node.attr
    return ""


def _docs(text: str | None) -> tuple[str | None, dict[str, str]]:
    description, parameters = [], {}
    for line in (text or "").splitlines():
        match = re.match(r"\s*(?:@param\s+|:param\s+)([\w-]+)\s*(?::|-)?\s*(.*)", line)
        if match:
            parameters[match[1]] = match[2]
        elif not re.match(r"\s*(?:@returns?|:returns?):", line):
            description.append(line)
    return "\n".join(description).strip() or None, parameters


def inspect_entry(source: str, native_module: str = "_fluentci_native") -> tuple[list[dict[str, object]], str, str]:
    tree = ast.parse(source)
    classes = {node.name: node for node in tree.body if isinstance(node, ast.ClassDef)}
    aliases = {node.targets[0].id: node.value for node in tree.body if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)}
    imports = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imports[alias.asname or alias.name] = f"{node.module}.{alias.name}"
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports[alias.asname or alias.name] = alias.name

    def qualified(node: ast.AST) -> str:
        name = _name(node)
        first, *rest = name.split(".")
        return ".".join([imports.get(first, first), *rest])

    def expand(node: ast.expr, seen: tuple[str, ...] = ()) -> ast.expr:
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return expand(ast.parse(node.value, mode="eval").body, seen)
        if isinstance(node, ast.Name) and node.id in aliases:
            if node.id in seen:
                raise ValueError("Recursive Python type aliases are unsupported")
            return expand(aliases[node.id], (*seen, node.id))
        return node

    def wire(node: ast.expr) -> str:
        node = expand(node)
        if isinstance(node, ast.Subscript):
            head = qualified(node.value).split(".")[-1]
            if head in ("Optional", "Required", "NotRequired"):
                return wire(node.slice)
            if head in ("list", "List"):
                inner = wire(node.slice)
                if inner.endswith("[]"):
                    raise ValueError("Nested Python input lists require a supported codec")
                return inner + "[]"
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            if isinstance(node.right, ast.Constant) and node.right.value is None:
                return wire(node.left)
        scalar = {"str": "string", "int": "integer", "float": "number", "bool": "boolean"}.get(qualified(node))
        if not scalar:
            raise ValueError(f"Unsupported Python input annotation {ast.unparse(node)}")
        return scalar

    functions: list[dict[str, object]] = []
    wrappers: list[ast.stmt] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        decorators = [decorator for decorator in node.decorator_list if qualified(decorator) == "extism.plugin_fn"]
        if not decorators:
            continue
        description, parameter_docs = _docs(ast.get_docstring(node))
        metadata: dict[str, object] = {"name": node.name}
        if description:
            metadata["description"] = description
        if node.returns:
            metadata["returnType"] = ast.unparse(expand(node.returns))
        parameters = [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]
        if not parameters and not node.args.vararg and not node.args.kwarg:
            functions.append(metadata)
            node.decorator_list = [value for value in node.decorator_list if value not in decorators]
            wrappers.extend(ast.parse(f"@extism.plugin_fn\ndef {node.name}() -> None:\n    _fluentci_native.{node.name}()\n").body)
            continue  # Legacy bodies keep their existing raw input.
        if isinstance(node, ast.AsyncFunctionDef) or len(parameters) != 1 or node.args.vararg or node.args.kwarg or node.args.defaults or any(value is not None for value in node.args.kw_defaults):
            raise ValueError(f"{node.name}: use one synchronous, typed argument record")
        if len(node.decorator_list) != 1 or not node.returns:
            raise ValueError(f"{node.name}: typed exports require a return annotation and only the plugin_fn decorator")
        parameter = parameters[0]
        annotation = expand(parameter.annotation) if parameter.annotation else None
        record = classes.get(_name(annotation)) if annotation else None
        if record is None:
            raise ValueError(f"{node.name}: input must be a local dataclass or TypedDict")
        dataclass = any(qualified(value.func if isinstance(value, ast.Call) else value) == "dataclasses.dataclass" for value in record.decorator_list)
        typed_dict = any(qualified(value) in ("typing.TypedDict", "typing_extensions.TypedDict") for value in record.bases)
        if not dataclass and not typed_dict:
            raise ValueError(f"{node.name}: annotate input as a dataclass or TypedDict")
        if any(qualified(base) not in ("typing.TypedDict", "typing_extensions.TypedDict", "object") for base in record.bases):
            raise ValueError("Input record inheritance must be flattened by its native type checker")
        total = not any(keyword.arg == "total" and isinstance(keyword.value, ast.Constant) and keyword.value.value is False for keyword in record.keywords)
        args: list[dict[str, object]] = []
        for index, member in enumerate(record.body):
            if not isinstance(member, ast.AnnAssign) or not isinstance(member.target, ast.Name):
                continue
            name = member.target.id
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", name) or name == "help":
                raise ValueError(f"Invalid named input field {name}")
            value_type = expand(member.annotation)
            if isinstance(value_type, ast.Subscript) and qualified(value_type.value).endswith("ClassVar"):
                continue
            required = member.value is None if dataclass else total
            if isinstance(value_type, ast.Subscript):
                marker = qualified(value_type.value).split(".")[-1]
                if marker == "NotRequired":
                    required = False
                elif marker == "Required":
                    required = True
            description = parameter_docs.get(name)
            following = record.body[index + 1] if index + 1 < len(record.body) else None
            if isinstance(following, ast.Expr) and isinstance(following.value, ast.Constant) and isinstance(following.value.value, str):
                description = following.value.value
            argument: dict[str, object] = {"name": name, "type": wire(value_type)}
            if not required:
                argument["required"] = False
            if description:
                argument["description"] = description
            args.append(argument)
        metadata["inputFormat"] = "json"
        metadata["args"] = args
        functions.append(metadata)
        original = node.name
        node.decorator_list = []
        call = f"{parameter.arg}=_fluentci_record" if node.args.kwonlyargs else "_fluentci_record"
        wrapper = f'''
@extism.plugin_fn
def {original}() -> None:
    _fluentci_data = _fluentci_json.loads(_fluentci_extism.input_str())
    _fluentci_check(_fluentci_data, {args!r})
    _fluentci_record = _fluentci_native.{_name(annotation)}(**_fluentci_data)
    _fluentci_result = _fluentci_native.{node.name}({call})
    if _fluentci_result is not None:
        _fluentci_extism.output_str(_fluentci_result if isinstance(_fluentci_result, str) else _fluentci_json.dumps(_fluentci_result))
'''
        wrappers.extend(ast.parse(wrapper).body)
    if wrappers:
        runtime = ast.parse('''
import extism as _fluentci_extism
import extism
import json as _fluentci_json
import math as _fluentci_math

def _fluentci_matches(value, kind):
    if kind.endswith("[]"):
        return isinstance(value, list) and all(_fluentci_matches(item, kind[:-2]) for item in value)
    if kind == "string": return isinstance(value, str) and "\\0" not in value
    if kind == "integer": return type(value) is int and -2147483648 <= value <= 2147483647
    if kind == "number": return type(value) in (int, float) and _fluentci_math.isfinite(value)
    if kind == "boolean": return type(value) is bool
    return False

def _fluentci_check(value, fields):
    if not isinstance(value, dict): raise ValueError("Expected a named argument object")
    if set(value) - {field["name"] for field in fields}: raise ValueError("Unknown named argument")
    for field in fields:
        if field["name"] not in value:
            if field.get("required", True): raise ValueError("Missing argument " + field["name"])
        elif not _fluentci_matches(value[field["name"]], field["type"]):
            raise ValueError(field["name"] + " expects " + field["type"])
''').body
        runtime.insert(0, ast.Import(names=[ast.alias(name=native_module, asname="_fluentci_native")]))
        entry = ast.Module(body=runtime + wrappers, type_ignores=[])
    else:
        entry = ast.Module(body=[], type_ignores=[])
    # Keep native names, globals, recursion, and calls between functions intact.
    return functions, ast.unparse(ast.fix_missing_locations(entry)) + "\n", ast.unparse(ast.fix_missing_locations(tree)) + "\n"


def embed_inspection(path: Path, functions: list[dict[str, object]]) -> None:
    binary = path.read_bytes()
    if binary[:8] != b"\0asm\x01\0\0\0":
        raise ValueError("Expected core Wasm")
    def uint(offset: int) -> tuple[int, int]:
        value, shift = 0, 0
        while offset < len(binary) and shift < 35:
            byte = binary[offset]
            offset += 1
            value |= (byte & 127) << shift
            if not byte & 128:
                return value, offset
            shift += 7
        raise ValueError("Invalid Wasm section")
    def leb(value: int) -> bytes:
        output = bytearray()
        while True:
            byte = value & 127
            value >>= 7
            output.append(byte | (128 if value else 0))
            if not value:
                return bytes(output)
    chunks, offset, exports = [binary[:8]], 8, set()
    while offset < len(binary):
        start = offset
        kind = binary[offset]
        length, offset = uint(offset + 1)
        end = offset + length
        if end > len(binary):
            raise ValueError("Truncated Wasm section")
        replace = False
        if kind == 0:
            size, name_offset = uint(offset)
            if name_offset + size > end:
                raise ValueError("Truncated Wasm custom section name")
            replace = binary[name_offset:name_offset + size] == b"fluentci:metadata"
        elif kind == 7:
            count, cursor = uint(offset)
            for _ in range(count):
                size, cursor = uint(cursor)
                if cursor + size >= end:
                    raise ValueError("Truncated Wasm export")
                name = binary[cursor:cursor + size].decode("utf-8")
                cursor += size
                export_kind = binary[cursor]
                _, cursor = uint(cursor + 1)
                if cursor > end:
                    raise ValueError("Truncated Wasm export index")
                if export_kind == 0 and not name.startswith(("__", "PyInit_")) and name not in ("_start", "_initialize"):
                    exports.add(name)
        if not replace:
            chunks.append(binary[start:end])
        offset = end
    names = [function["name"] for function in functions]
    if len(names) != len(set(names)) or set(names) != exports:
        raise ValueError("Inspected functions do not match the compiled Wasm exports")
    metadata = json.dumps({"functions": functions}, separators=(",", ":")).encode()
    if len(metadata) > 256 * 1024:
        raise ValueError("Function metadata exceeds 256 KiB")
    key = b"fluentci:metadata"
    payload = leb(len(key)) + key + metadata
    output = b"".join(chunks) + b"\0" + leb(len(payload)) + payload
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary.write(output)
        temporary_path = temporary.name
    try:
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
    path.with_name("fluentci.metadata.json").write_text(json.dumps({"sha256": sha256(output).hexdigest(), "functions": functions}, indent=2) + "\n")
