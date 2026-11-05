#!/usr/bin/env python3
"""Compare executor libraries in release mode without running the FluentCI CLI."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile


def run(command, **kwargs):
    return subprocess.run(command, check=True, text=True, **kwargs)


def sources_digest(crate):
    digest = hashlib.sha256()
    paths = [crate / "Cargo.toml", *sorted((crate / "src").rglob("*.rs"))]
    primitives = crate.parent / "primitives"
    paths.extend([primitives / "Cargo.toml", *sorted((primitives / "src").rglob("*.rs"))])
    for path in paths:
        digest.update(str(path.relative_to(crate.parent)).encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="97ce914^")
    parser.add_argument("--baseline-repo", type=Path)
    parser.add_argument("--samples", type=int, default=7)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not 3 <= args.samples <= 101:
        parser.error("--samples must be between 3 and 101")
    crate = Path(__file__).resolve().parents[1]
    repo = Path(run(["git", "-C", str(crate), "rev-parse", "--show-toplevel"], capture_output=True).stdout.strip())
    baseline_repo = args.baseline_repo or (repo if (repo / "crates/executor").is_dir() else repo.parent / "fluentci-engine")
    baseline_commit = run(["git", "-C", str(baseline_repo), "rev-parse", args.baseline], capture_output=True).stdout.strip()
    current_commit = run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True).stdout.strip()
    with tempfile.TemporaryDirectory(prefix="executor-benchmark-") as scratch:
        root = Path(scratch)
        old = root / "baseline"
        paths = run(["git", "-C", str(baseline_repo), "ls-tree", "-r", "--name-only", baseline_commit, "--", "crates/executor/Cargo.toml", "crates/executor/src"], capture_output=True).stdout.splitlines()
        for name in paths:
            relative = Path(name).relative_to("crates/executor")
            target = old / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(subprocess.check_output(["git", "-C", str(baseline_repo), "show", f"{baseline_commit}:{name}"]))
        manifest = old / "Cargo.toml"
        manifest.write_text(manifest.read_text().replace('name = "fluentci-executor"', 'name = "fluentci-executor-baseline"', 1))
        (root / "src").mkdir()
        benchmark_source = (crate / "benchmarks/compare.rs").read_bytes()
        (root / "src/main.rs").write_bytes(benchmark_source)
        (root / "Cargo.toml").write_text(f'''[package]
name = "executor-benchmark"
version = "0.0.0"
edition = "2021"
[workspace]
[dependencies]
before = {{ package = "fluentci-executor-baseline", path = {json.dumps(str(old))} }}
after = {{ package = "fluentci-executor", path = {json.dumps(str(crate))} }}
serde_json = "1"
tempfile = "3"
[profile.release]
lto = "thin"
''')
        # Preserve the engine's dependency versions; add only the benchmark root
        # and renamed baseline package. No registry update or network is needed.
        (root / "Cargo.lock").write_bytes((baseline_repo / "Cargo.lock").read_bytes())
        run(["cargo", "update", "--offline", "--workspace"], cwd=root, stdout=subprocess.DEVNULL)
        env = os.environ.copy()
        env.pop("CARGO_TARGET_DIR", None)
        source_hash = sources_digest(crate)
        run(["cargo", "clippy", "--release", "--locked", "--all-targets", "--", "-D", "warnings"], cwd=root, env=env)
        run(["cargo", "build", "--release", "--locked"], cwd=root, env=env)
        binary_hash = hashlib.sha256((root / "target/release/executor-benchmark").read_bytes()).hexdigest()
        measured = run([str(root / "target/release/executor-benchmark"), str(args.samples)], cwd=root, env=env, capture_output=True)
        if sources_digest(crate) != source_hash:
            raise RuntimeError("executor sources changed during the benchmark; rerun on a stable checkout")
        result = json.loads(measured.stdout)
        result["environment"] = {
            "platform": platform.platform(), "cpu": platform.machine(), "logical_cpus": os.cpu_count(),
            "rustc": run(["rustc", "--version"], capture_output=True).stdout.strip(),
            "baseline_commit": baseline_commit, "current_commit": current_commit,
            "current_sources_sha256": source_hash, "benchmark_binary_sha256": binary_hash,
            "benchmark_source_sha256": hashlib.sha256(benchmark_source).hexdigest(),
            "lockfile_sha256": hashlib.sha256((root / "Cargo.lock").read_bytes()).hexdigest(),
            "current_dirty": bool(run(["git", "-C", str(repo), "status", "--porcelain", "--", str(crate)], capture_output=True).stdout.strip()),
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
        print(f"Report: {args.output}")


if __name__ == "__main__":
    main()
