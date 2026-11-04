"""Pure native file task constructors. Paths are relative to task cwd.

Query results are returned in TaskResult.file_result. No shell is invoked.
"""
from dataclasses import replace
from typing import Any
from .plan import Task


def _task(id: str, op: str, cwd: str, **values: Any) -> Task:
    return Task(id, "", cwd=cwd, file_operation=tuple({"op": op, **values}.items()))


def env_file(task: Task, path: str) -> Task:
    return replace(task, env_files=(*task.env_files, path))


def read_text(id: str, path: str, *, limit_bytes: int = 1048576, cwd: str = ".") -> Task:
    return _task(id, "read_text", cwd, path=path, limit_bytes=limit_bytes)


def read_bytes(id: str, path: str, *, limit_bytes: int = 1048576, cwd: str = ".") -> Task:
    return _task(id, "read_bytes", cwd, path=path, limit_bytes=limit_bytes)


def write_text(id: str, path: str, text: str, *, overwrite: bool = False, cwd: str = ".") -> Task:
    return _task(id, "write_text", cwd, path=path, text=text, overwrite=overwrite)


def write_bytes(id: str, path: str, data: bytes, *, overwrite: bool = False, cwd: str = ".") -> Task:
    return _task(id, "write_bytes", cwd, path=path, bytes=tuple(data), overwrite=overwrite)


def copy_file(id: str, source: str, destination: str, *, overwrite: bool = False, cwd: str = ".") -> Task:
    return _task(id, "copy_file", cwd, source=source, destination=destination, overwrite=overwrite)


def copy_tree(id: str, source: str, destination: str, *, overwrite: bool = False, cwd: str = ".") -> Task:
    return _task(id, "copy_tree", cwd, source=source, destination=destination, overwrite=overwrite)


def move(id: str, source: str, destination: str, *, overwrite: bool = False, cwd: str = ".") -> Task:
    return _task(id, "move", cwd, source=source, destination=destination, overwrite=overwrite)


def mkdir(id: str, path: str, *, parents: bool = False, cwd: str = ".") -> Task:
    return _task(id, "mkdir", cwd, path=path, parents=parents)


def remove(id: str, path: str, *, recursive: bool = False, missing_ok: bool = False, cwd: str = ".") -> Task:
    return _task(id, "remove", cwd, path=path, recursive=recursive, missing_ok=missing_ok)


def stat(id: str, path: str, *, cwd: str = ".") -> Task:
    return _task(id, "stat", cwd, path=path)


def exists(id: str, path: str, *, cwd: str = ".") -> Task:
    return _task(id, "exists", cwd, path=path)


def list_entries(id: str, path: str = ".", *, cwd: str = ".") -> Task:
    return _task(id, "list", cwd, path=path)


def glob(id: str, pattern: str, *, cwd: str = ".") -> Task:
    return _task(id, "glob", cwd, pattern=pattern)


def hash(id: str, path: str, *, cwd: str = ".") -> Task:
    return _task(id, "hash", cwd, path=path)


def chmod(id: str, path: str, mode: int, *, cwd: str = ".") -> Task:
    return _task(id, "chmod", cwd, path=path, mode=mode)


def symlink(id: str, target: str, path: str, *, cwd: str = ".") -> Task:
    return _task(id, "symlink", cwd, target=target, path=path)

