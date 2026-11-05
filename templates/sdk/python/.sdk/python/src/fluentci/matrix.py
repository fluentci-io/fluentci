"""Pure named cases, bounded Cartesian products, and matrix-to-task expansion."""
from __future__ import annotations
from dataclasses import dataclass, replace
import re
from typing import Callable, Generic, Iterable, TypeVar
from urllib.parse import quote
from .plan import Plan, Task

A = TypeVar("A")
B = TypeVar("B")
MAX_CASES = 4096

@dataclass(frozen=True, slots=True)
class Case(Generic[A]):
    key: str
    value: A

def named(name: str, value: A) -> Case[A]:
    return Case(quote(name, safe="-._~"), value)

def axis(name: str, values: Iterable[str]) -> tuple[Case[str], ...]:
    return tuple(Case(f"{quote(name, safe='-._~')}={quote(value, safe='-._~')}", value) for value in values)

def product(left: tuple[Case[A], ...], right: tuple[Case[B], ...]) -> tuple[Case[tuple[A, B]], ...]:
    if len(left) * len(right) > MAX_CASES:
        raise ValueError("matrix expansion exceeds 4096 cases")
    return tuple(Case(f"{a.key},{b.key}", (a.value, b.value)) for a in left for b in right)

def include(cases: tuple[Case[A], ...], extra: Iterable[Case[A]]) -> tuple[Case[A], ...]:
    return (*cases, *extra)

def exclude(cases: tuple[Case[A], ...], predicate: Callable[[A], bool]) -> tuple[Case[A], ...]:
    return tuple(case for case in cases if not predicate(case.value))

def matrix(name: str, cases: tuple[Case[A], ...], build: Callable[[A], Task]) -> tuple[Task, ...]:
    if re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", name) is None:
        raise ValueError("invalid matrix name")
    if len(cases) > MAX_CASES:
        raise ValueError("matrix expansion exceeds 4096 cases")
    keys = [case.key for case in cases]
    if len(set(keys)) != len(keys) or any(not key or "\0" in key for key in keys):
        raise ValueError("matrix cases require unique, nonempty keys without NUL")
    return tuple(replace(build(case.value), id=f"{name}[{case.key}]") for case in cases)

def after(parents: Iterable[Task], task: Task) -> Task:
    return replace(task, needs=tuple(dict.fromkeys((*task.needs, *(parent.id for parent in parents)))))

def parallel(tasks: Iterable[Task], jobs: int) -> Plan:
    return Plan(tuple(tasks), jobs=jobs)
