from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
import json
from typing import Any, Literal


class Provider(str, Enum):
    NIX = "nix"
    FLOX = "flox"
    DEVBOX = "devbox"
    DEVENV = "devenv"
    ENVHUB = "envhub"
    HERMIT = "hermit"
    MISE = "mise"
    PIXI = "pixi"
    PKGX = "pkgx"


def _quote(value: str) -> str:
    if "\0" in value:
        raise ValueError("command arguments cannot contain NUL")
    return "'" + value.replace("'", "'\\''") + "'"


@dataclass(frozen=True, slots=True)
class _Step:
    kind: Literal["exec", "shell", "workdir", "env", "cache", "provider"]
    values: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Pipeline:
    """A reusable value. Construction performs no FluentCI calls or process IO."""
    name: str
    steps: tuple[_Step, ...] = ()
    services: tuple[Service, ...] = ()

    def exec(self, program: str, *arguments: str) -> Pipeline:
        if not program:
            raise ValueError("program must not be empty")
        values = (program, *arguments)
        for value in values:
            _quote(value)
        return replace(self, steps=(*self.steps, _Step("exec", values)))

    def shell(self, command: str) -> Pipeline:
        """Explicit shell syntax; exec() preserves literal argument boundaries."""
        return replace(self, steps=(*self.steps, _Step("shell", (command,))))

    def with_workdir(self, path: str) -> Pipeline:
        return replace(self, steps=(*self.steps, _Step("workdir", (path,))))

    def with_env(self, key: str, value: str) -> Pipeline:
        if not key or "=" in key or "\0" in key or "\0" in value:
            raise ValueError("invalid environment entry")
        return replace(self, steps=(*self.steps, _Step("env", (key, value))))

    def with_cache(self, key: str, path: str) -> Pipeline:
        return replace(self, steps=(*self.steps, _Step("cache", (key, path))))

    def using(self, provider: Provider, *, impure: bool = False) -> Pipeline:
        return replace(self, steps=(*self.steps, _Step("provider", (provider.value, str(impure)))))

    def as_service(self, name: str) -> Service:
        return Service(name, self)

    def with_service(self, service: Service) -> Pipeline:
        return replace(self, services=(*self.services, service))

    def stdout(self) -> str:
        from . import _imports as api
        self._emit({})
        return api.stdout()

    def stderr(self) -> str:
        from . import _imports as api
        self._emit({})
        return api.stderr()

    def _emit(self, services: dict[int, str]) -> None:
        from . import _imports as api
        service_ids: list[str] = []
        for service in self.services:
            object_id = id(service)
            if object_id not in services:
                service.pipeline._emit(services)
                services[object_id] = _id(api.as_service(service.name))
            service_ids.append(services[object_id])
        api.set_runner("default")
        api.pipeline(self.name)
        for service_id in service_ids:
            api.with_service(service_id)
        for step in self.steps:
            if step.kind == "exec":
                api.with_exec(json.dumps([_quote(value) for value in step.values]))
            elif step.kind == "shell":
                api.with_exec(json.dumps([step.values[0]]))
            elif step.kind == "workdir":
                api.with_workdir(step.values[0])
            elif step.kind == "env":
                api.set_envs(json.dumps([step.values]))
            elif step.kind == "cache":
                cache_id = _id(api.cache(step.values[0]))
                api.with_cache(json.dumps({"id": cache_id, "key": step.values[0], "path": step.values[1]}))
            elif step.kind == "provider":
                name, impure = step.values
                api.set_runner(name)
                if name == "nix":
                    api.nix(json.dumps({"impure": impure == "True"}))
                else:
                    getattr(api, name)()


@dataclass(frozen=True, slots=True)
class Service:
    name: str
    pipeline: Pipeline


def _id(document: str) -> str:
    value: Any = json.loads(document)
    if not isinstance(value, dict) or not isinstance(value.get("id"), str):
        raise RuntimeError("FluentCI returned an invalid handle")
    identity: str = value["id"]
    return identity


def pipeline(name: str) -> Pipeline:
    if not name:
        raise ValueError("pipeline name must not be empty")
    return Pipeline(name)


def get_env(key: str) -> str:
    from . import _imports as api
    return api.get_env(key)


def has_env(key: str) -> bool:
    from . import _imports as api
    value: Any = json.loads(api.has_env(key))
    if not isinstance(value, bool):
        raise RuntimeError("FluentCI returned an invalid boolean")
    return value


@dataclass(frozen=True, slots=True)
class File:
    path: str

    def sha256(self) -> str:
        from . import _imports as api
        api.file(self.path)
        return api.sha256(self.path)

    def md5(self) -> str:
        from . import _imports as api
        api.file(self.path)
        return api.md5(self.path)


def file(path: str) -> File:
    return File(path)
