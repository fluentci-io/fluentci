#!/usr/bin/env python3
"""Resolve official pinned components for bootstrap CLIs with core-only download validation."""

import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.parse
import urllib.request

USER_AGENT = "fluentci-ci-bootstrap/1.0"
MAX_BYTES = 64 * 1024 * 1024
MAGIC = (b"\0asm\x01\0\0\0", b"\0asm\x0d\0\x01\0")


def verified(path, digest, size):
    if not path.is_file() or path.stat().st_size != size:
        return False
    with path.open("rb") as stream:
        if stream.read(8) not in MAGIC:
            return False
        stream.seek(0)
        return hashlib.file_digest(stream, "sha256").hexdigest() == digest


def resolve(reference, directory, opener=urllib.request.urlopen):
    match = re.fullmatch(r"(?:@fluentci\.io/)?([a-z][a-z0-9-]{0,63})@v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)", reference)
    if not match:
        raise ValueError("Use an exact official package reference, for example setup-node@v0.2.0")
    name, version = match.groups()
    endpoint = "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?" + urllib.parse.urlencode({"author": "fluentci.io", "name": name, "version": version})
    with opener(urllib.request.Request(endpoint, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}), timeout=30) as response:
        metadata = response.read(2 * 1024 * 1024 + 1)
    if len(metadata) > 2 * 1024 * 1024:
        raise ValueError("Registry metadata is too large")
    package = json.loads(metadata)["package"]
    digest, size, url = package["sha256"], package["size"], package["url"]
    if package["name"] != name or package["version"] != version:
        raise ValueError("Registry returned a different package or version")
    if not re.fullmatch(r"[a-f0-9]{64}", digest) or type(size) is not int or not 8 <= size <= MAX_BYTES:
        raise ValueError("Registry returned an invalid Wasm checksum or size")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or not parsed.path.endswith(".wasm"):
        raise ValueError("Registry returned an invalid HTTPS Wasm URL")
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{digest}.wasm"
    if verified(target, digest, size):
        return target
    temporary = None
    try:
        request = urllib.request.Request(url, headers={"Accept-Encoding": "identity", "User-Agent": USER_AGENT})
        with opener(request, timeout=90) as response, tempfile.NamedTemporaryFile(dir=directory, delete=False) as output:
            temporary = Path(output.name)
            if urllib.parse.urlsplit(response.geturl()).scheme != "https":
                raise ValueError("Artifact download redirected away from HTTPS")
            received = 0
            while chunk := response.read(64 * 1024):
                received += len(chunk)
                if received > size:
                    raise ValueError("Downloaded artifact exceeds its published size")
                output.write(chunk)
        if not verified(temporary, digest, size):
            raise ValueError("Downloaded Wasm checksum, size, or module/component header does not match")
        os.replace(temporary, target)
        return target
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: registry-artifact.py NAME@VERSION")
    try:
        cache = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())) / "fluentci-registry"
        print(resolve(sys.argv[1], cache))
    except (ValueError, KeyError, OSError, TypeError) as error:
        sys.exit(f"Could not resolve registry component: {error}")


if __name__ == "__main__":
    main()
