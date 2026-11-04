"""Generate tiny Wasm trap fixtures without invoking any compiler."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)


def section(kind, data):
    assert len(data) < 128
    return bytes([kind, len(data)]) + data


for name, memory, code in [
    ("unreachable", False, b"\x00"),
    # Load from the first byte beyond the current linear memory, computed at runtime.
    ("memory_oob", True, b"\x3f\x00\x41\x10\x74\x28\x02\x00"),
]:
    module = b"\x00asm\x01\x00\x00\x00"
    module += section(1, b"\x01\x60\x00\x01\x7f")
    module += section(3, b"\x01\x00")
    if memory:
        module += section(5, b"\x01\x00\x01")
    export = name.encode("ascii")
    module += section(7, bytes([1, len(export)]) + export + b"\x00\x00")
    body = b"\x00" + code + b"\x0b"
    module += section(10, bytes([1, len(body)]) + body)
    (root / f"{name}.wasm").write_bytes(module)


def unsigned(value):
    output = bytearray()
    while value > 127:
        output.append((value & 127) | 128)
        value >>= 7
    output.append(value)
    return bytes(output)


def signed(value):
    output = bytearray()
    while True:
        byte = value & 127
        value >>= 7
        finished = (value == 0 and not byte & 64) or (value == -1 and byte & 64)
        output.append(byte if finished else byte | 128)
        if finished:
            return bytes(output)


def encoded_string(value):
    value = value.encode("ascii")
    return unsigned(len(value)) + value


def wasm_section(kind, data):
    return bytes([kind]) + unsigned(len(data)) + data


# Allocate an Extism string, call FluentCI's real get_env import, and return it.
# This fixture needs no compiler or language SDK inside the BSD guest.
types = [b"\x60\x01\x7e\x01\x7e", b"\x60\x02\x7e\x7f\x00",
         b"\x60\x02\x7e\x7e\x00", b"\x60\x00\x01\x7f"]
imports = [("extism:host/env", "alloc", 0), ("extism:host/env", "store_u8", 1),
           ("extism:host/user", "get_env", 0), ("extism:host/env", "length", 0),
           ("extism:host/env", "output_set", 2)]
module = b"\x00asm\x01\x00\x00\x00"
module += wasm_section(1, unsigned(len(types)) + b"".join(types))
module += wasm_section(2, unsigned(len(imports)) + b"".join(
    encoded_string(namespace) + encoded_string(name) + b"\x00" + unsigned(kind)
    for namespace, name, kind in imports))
module += wasm_section(3, b"\x01\x03")
module += wasm_section(7, b"\x01" + encoded_string("env_roundtrip") + b"\x00\x05")
key = b"FLUENTCI_BSD_SMOKE"
code = b"\x01\x02\x7e\x42" + signed(len(key)) + b"\x10\x00\x21\x00"
for index, byte in enumerate(key):
    code += b"\x20\x00\x42" + signed(index) + b"\x7c\x41" + signed(byte) + b"\x10\x01"
code += b"\x20\x00\x10\x02\x22\x01\x20\x01\x10\x03\x10\x04\x41\x00\x0b"
module += wasm_section(10, b"\x01" + unsigned(len(code)) + code)
(root / "host_import.wasm").write_bytes(module)
