"""Small immutable task combinators; execution stays at Plan.run()."""
from dataclasses import replace
from .plan import Condition, OutputRef, Policy, Probe, Retry, Service, Task


def retry(task: Task, attempts: int = 3, delay_ms: int = 250, *,
          max_delay_ms: int = 60_000, exit_codes: tuple[int, ...] = ()) -> Task:
    return replace(task, policy=replace(task.policy or Policy(),
        retry=Retry(attempts, delay_ms, max_delay_ms, exit_codes)))


def when(task: Task, condition: Condition) -> Task:
    finalizer = condition in ("always", "failure")
    return replace(task, policy=replace(task.policy or Policy(), when=condition),
        timeout_ms=task.timeout_ms if not finalizer or task.timeout_ms is not None else 30_000,
        resource_wait_timeout_ms=task.resource_wait_timeout_ms if not finalizer or task.resource_wait_timeout_ms is not None else 30_000)


def always(task: Task) -> Task:
    return when(task, "always")


def allow_failure(task: Task, enabled: bool = True) -> Task:
    return replace(task, policy=replace(task.policy or Policy(), allow_failure=enabled))


def artifact(task: Task, name: str, path: str) -> Task:
    policy = task.policy or Policy()
    return replace(task, policy=replace(policy, artifacts=tuple({**dict(policy.artifacts), name: path}.items())))


def output(task: Task, name: str, path: str) -> Task:
    policy = task.policy or Policy()
    return replace(task, policy=replace(policy, outputs=tuple({**dict(policy.outputs), name: path}.items())))


def output_env(task: Task, key: str, producer: Task, name: str) -> Task:
    policy = task.policy or Policy()
    return replace(task, needs=tuple(dict.fromkeys((*task.needs, producer.id))),
        policy=replace(policy, bindings=tuple({**dict(policy.bindings), key: OutputRef(producer.id, name)}.items())))


def resource(task: Task, name: str) -> Task:
    return replace(task, resources=tuple(dict.fromkeys((*task.resources, name))))


def service(task: Task, readiness: Probe, *, startup_timeout_ms: int = 30_000,
            shutdown_timeout_ms: int = 5000, failure_threshold: int = 3) -> Task:
    return replace(task, service=Service(readiness, startup_timeout_ms, shutdown_timeout_ms, failure_threshold))
