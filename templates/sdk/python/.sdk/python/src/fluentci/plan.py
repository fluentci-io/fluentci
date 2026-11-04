"""Native task/plan values. run() is a guest PDK effect, not an embedded host."""
from __future__ import annotations
from dataclasses import asdict, dataclass, field, replace
import json
from typing import Any, Literal, Mapping, TypeAlias
from types import MappingProxyType

@dataclass(frozen=True, slots=True)
class Cache:
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    toolchain: str

FileValue: TypeAlias = str | int | float | bool | None | list["FileValue"] | dict[str, "FileValue"]

Condition = Literal["success", "failure", "always", "never"]

@dataclass(frozen=True, slots=True)
class Retry:
    max_attempts: int = 3
    delay_ms: int = 250
    max_delay_ms: int = 60_000
    exit_codes: tuple[int, ...] = ()

@dataclass(frozen=True, slots=True)
class Probe:
    program: str
    args: tuple[str, ...] = ()
    interval_ms: int = 250
    timeout_ms: int = 1000

@dataclass(frozen=True, slots=True)
class Service:
    readiness: Probe
    startup_timeout_ms: int = 30_000
    shutdown_timeout_ms: int = 5000
    failure_threshold: int = 3

@dataclass(frozen=True, slots=True)
class OutputRef:
    task: str
    name: str

@dataclass(frozen=True, slots=True)
class Policy:
    when: Condition = "success"
    retry: Retry | None = None
    allow_failure: bool = False
    outputs: tuple[tuple[str, str], ...] = ()
    artifacts: tuple[tuple[str, str], ...] = ()
    bindings: tuple[tuple[str, OutputRef], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        value: dict[str, Any] = {"when": self.when, "allow_failure": self.allow_failure,
            "outputs": dict(self.outputs), "artifacts": dict(self.artifacts),
            "bindings": {key: asdict(ref) for key, ref in self.bindings}}
        if self.retry is not None:
            value["retry"] = asdict(self.retry)
        return value

@dataclass(frozen=True, slots=True)
class Task:
    id: str
    program: str
    args: tuple[str, ...] = ()
    cwd: str = "."
    env: tuple[tuple[str, str], ...] = ()
    needs: tuple[str, ...] = ()
    timeout_ms: int | None = None
    cache: Cache | None = None
    resources: tuple[str, ...] = ()
    resource_wait_timeout_ms: int | None = None
    service: Service | None = None
    policy: Policy | None = None
    file_operation: tuple[tuple[str, Any], ...] | None = None
    env_files: tuple[str, ...] = ()

    def with_env(self, key: str, value: str) -> Task:
        return replace(self, env=(*self.env, (key, value)))

    def to_dict(self) -> dict[str, Any]:
        value: dict[str, Any] = {"id": self.id, "program": self.program, "args": list(self.args),
                                 "cwd": self.cwd, "env": dict(self.env), "needs": list(self.needs)}
        if self.timeout_ms is not None:
            value["timeout_ms"] = self.timeout_ms
        if self.cache is not None:
            value["cache"] = {"inputs": list(self.cache.inputs), "outputs": list(self.cache.outputs), "toolchain": self.cache.toolchain}
        if self.resources:
            value["resources"] = list(self.resources)
        if self.resource_wait_timeout_ms is not None:
            value["resource_wait_timeout_ms"] = self.resource_wait_timeout_ms
        if self.service is not None:
            value["service"] = asdict(self.service)
        if self.file_operation is not None:
            value["file_operation"] = dict(self.file_operation)
        if self.env_files:
            value["env_files"] = list(self.env_files)
        if self.policy is not None:
            value["policy"] = self.policy.to_dict()
        return value

@dataclass(frozen=True, slots=True)
class Artifact:
    path: str
    size: int
    sha256: str

@dataclass(frozen=True, slots=True)
class Attempt:
    number: int
    status: str
    exit_code: int | None
    duration_ms: int
    error: str | None

@dataclass(frozen=True, slots=True)
class TaskResult:
    id: str
    status: Literal["succeeded", "failed", "skipped", "cancelled", "timed_out"]
    exit_code: int | None
    stdout: str
    stderr: str
    error: str | None
    outputs: Mapping[str, str] = field(default_factory=dict)
    artifacts: Mapping[str, Artifact] = field(default_factory=dict)
    attempts: tuple[Attempt, ...] = ()
    allowed_failure: bool = False
    condition_skipped: bool = False
    signal: int | None = None
    file_result: FileValue = None

@dataclass(frozen=True, slots=True)
class RunResult:
    outcome: Literal["succeeded", "failed", "cancelled"]
    tasks: tuple[TaskResult, ...]

    @property
    def succeeded(self) -> bool:
        return self.outcome == "succeeded"

@dataclass(frozen=True, slots=True)
class Plan:
    tasks: tuple[Task, ...]
    jobs: int = 1
    fail_fast: bool = True
    cache_dir: str | None = None

    def to_json(self) -> str:
        if self.jobs < 1:
            raise ValueError("jobs must be positive")
        ids = [task.id for task in self.tasks]
        if len(ids) != len(set(ids)) or any(not key for key in ids):
            raise ValueError("tasks require unique, nonempty IDs")
        value: dict[str, Any] = {"version": 1, "inherit_env": False, "jobs": self.jobs,
                                 "fail_fast": self.fail_fast, "tasks": [task.to_dict() for task in self.tasks]}
        if self.cache_dir is not None:
            value["cache_dir"] = self.cache_dir
        return json.dumps(value)

    def run(self, run_dir: str) -> RunResult:
        from . import _imports as api
        request = json.dumps({"plan": json.loads(self.to_json()), "run_dir": run_dir})
        raw: Any = json.loads(api.execute_plan(request))
        if not isinstance(raw, dict) or raw.get("outcome") not in {"succeeded", "failed", "cancelled"} or not isinstance(raw.get("tasks"), list):
            raise RuntimeError("invalid terminal plan report")
        tasks: list[TaskResult] = []
        for row in raw["tasks"]:
            if not isinstance(row, dict) or row.get("status") not in {"succeeded", "failed", "skipped", "cancelled", "timed_out"}:
                raise RuntimeError("invalid terminal task report")
            tasks.append(TaskResult(row["id"], row["status"], row["exit_code"], row["stdout"], row["stderr"], row["error"],
                MappingProxyType(dict(row.get("outputs", {}))),
                MappingProxyType({name: Artifact(**artifact) for name, artifact in row.get("artifacts", {}).items()}),
                tuple(Attempt(**attempt) for attempt in row.get("attempts", [])),
                row.get("allowed_failure", False), row.get("condition_skipped", False), row.get("signal"), row.get("file_result")))
        return RunResult(raw["outcome"], tuple(tasks))
