"""Pure native operation tasks. IO begins only when their plan executes."""
from dataclasses import asdict, dataclass
from typing import Any, Literal
from .plan import Task

Direction = Literal["upload", "download"]
Action = Literal["get", "put", "list", "delete"]
Algorithm = Literal["sha256", "sha512"]

@dataclass(frozen=True, slots=True)
class Connection:
    host: str
    user: str | None = None
    port: int = 22
    identity: str | None = None
    install: bool = True

def _task(id: str, operation: dict[str, Any], cwd: str) -> Task:
    return Task(id=id, program="", cwd=cwd, primitive=tuple(operation.items()))

def os(id: str, cwd: str = ".") -> Task:
    return _task(id, {"kind": "os"}, cwd)

def arch(id: str, cwd: str = ".") -> Task:
    return _task(id, {"kind": "arch"}, cwd)

def digest_text(id: str, algorithm: Algorithm, text: str, cwd: str = ".") -> Task:
    return _task(id, {"kind": "digest", "algorithm": algorithm, "input": {"source": "text", "value": text}}, cwd)

def digest_file(id: str, algorithm: Algorithm, path: str, cwd: str = ".") -> Task:
    return _task(id, {"kind": "digest", "algorithm": algorithm, "input": {"source": "file", "value": path}}, cwd)

def ssh(id: str, connection: Connection, command: list[str], cwd: str = ".") -> Task:
    return _task(id, {"kind": "ssh", "connection": asdict(connection), "command": command}, cwd)

def _transfer(kind: str, id: str, connection: Connection, direction: Direction, source: str, destination: str, cwd: str) -> Task:
    return _task(id, {"kind": kind, "connection": asdict(connection), "direction": direction, "source": source, "destination": destination}, cwd)

def scp(id: str, connection: Connection, direction: Direction, source: str, destination: str, cwd: str = ".") -> Task:
    return _transfer("scp", id, connection, direction, source, destination, cwd)

def sftp(id: str, connection: Connection, direction: Direction, source: str, destination: str, cwd: str = ".") -> Task:
    return _transfer("sftp", id, connection, direction, source, destination, cwd)

def rsync(id: str, connection: Connection, direction: Direction, source: str, destination: str, cwd: str = ".") -> Task:
    return _transfer("rsync", id, connection, direction, source, destination, cwd)

def ftp(id: str, url: str, action: Action, path: str | None = None, *, username_env: str | None = None, password_env: str | None = None, install: bool = True, cwd: str = ".") -> Task:
    return _task(id, {"kind": "ftp", "url": url, "action": action, "path": path, "username_env": username_env, "password_env": password_env, "install": install}, cwd)

def ftps(id: str, url: str, action: Action, path: str | None = None, *, username_env: str | None = None, password_env: str | None = None, install: bool = True, cwd: str = ".") -> Task:
    return _task(id, {"kind": "ftps", "url": url, "action": action, "path": path, "username_env": username_env, "password_env": password_env, "install": install}, cwd)

def s3(id: str, bucket: str, key: str, action: Action, path: str | None = None, *, endpoint: str | None = None, region: str | None = None, install: bool = True, cwd: str = ".") -> Task:
    return _task(id, {"kind": "s3", "bucket": bucket, "key": key, "action": action, "path": path, "endpoint": endpoint, "region": region, "install": install}, cwd)
