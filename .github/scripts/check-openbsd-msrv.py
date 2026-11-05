"""Check the selected OpenBSD dependency graph without compiling anything."""
import json
import subprocess

graph = json.loads(subprocess.check_output([
    "cargo", "metadata", "--locked", "--filter-platform", "x86_64-unknown-openbsd", "--format-version", "1",
], text=True))
packages = {p["id"]: p for p in graph["packages"]}
nodes = {n["id"]: n for n in graph["resolve"]["nodes"]}
root = next(p["id"] for p in graph["packages"] if p["name"] == "fluentci")
pending, reachable = [root], set()
while pending:
    package = pending.pop()
    if package in reachable:
        continue
    reachable.add(package)
    pending.extend(d["pkg"] for d in nodes[package]["deps"])
errors = []
for ident in sorted(reachable):
    package = packages[ident]
    required = package.get("rust_version")
    if required and tuple(map(int, (required.split(".") + ["0", "0"])[:3])) > (1, 90, 0):
        errors.append(f'{package["name"]} {package["version"]} requires Rust {required}')
runtimes = {(packages[i]["name"], packages[i]["version"]) for i in reachable
            if packages[i]["name"] in {"extism", "fluentci-extism-openbsd", "wasmtime"}}
if runtimes != {("fluentci-extism-openbsd", "1.21.1"), ("wasmtime", "41.0.4")}:
    errors.append(f"Unexpected OpenBSD runtimes: {sorted(runtimes)}")
if errors:
    raise SystemExit("\n".join(errors))
print(f"OpenBSD graph: {len(reachable)} packages, declared MSRVs <= 1.90.0; compatible runtime selected")
