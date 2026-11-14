"""Reject dynamic/glibc-linked executables in portable musl release assets."""
from pathlib import Path
import struct
import sys


def verify(binary, target):
    machines = {"x86_64-unknown-linux-musl": 62, "aarch64-unknown-linux-musl": 183}
    if target not in machines:
        raise ValueError("Unsupported musl release target")
    data = Path(binary).read_bytes()
    if len(data) < 64 or data[:6] != b"\x7fELF\x02\x01":
        raise ValueError("Expected a little-endian ELF64 executable")
    if struct.unpack_from("<H", data, 18)[0] != machines[target]:
        raise ValueError("ELF architecture does not match the release target")
    offset = struct.unpack_from("<Q", data, 32)[0]
    size, count = struct.unpack_from("<HH", data, 54)
    if size < 56 or count == 0 or offset + size * count > len(data):
        raise ValueError("Invalid ELF program headers")
    for index in range(count):
        header = offset + size * index
        kind = struct.unpack_from("<I", data, header)[0]
        start = struct.unpack_from("<Q", data, header + 8)[0]
        length = struct.unpack_from("<Q", data, header + 32)[0]
        if start + length > len(data):
            raise ValueError("Truncated ELF segment")
        if kind == 3:
            raise ValueError("Portable musl binaries must not require a dynamic interpreter")
        if kind == 2:
            if length % 16:
                raise ValueError("Invalid ELF dynamic segment")
            for position in range(start, start + length, 16):
                tag = struct.unpack_from("<q", data, position)[0]
                if tag == 0:
                    break
                if tag == 1:
                    raise ValueError("Portable musl binaries must not require shared libraries")


if __name__ == "__main__":
    verify(sys.argv[1], sys.argv[2])
    print("Verified static musl ELF: " + sys.argv[2])
