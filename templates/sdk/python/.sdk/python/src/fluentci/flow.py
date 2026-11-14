"""Typed immutable pipelines. Construction performs no IO; run is the terminal."""
from __future__ import annotations
from dataclasses import dataclass, replace
from copy import deepcopy
from typing import Callable, Generic, TypeVar, Any, cast
from time import time_ns
import json

T = TypeVar('T')
U = TypeVar('U')
A = TypeVar('A')

@dataclass(frozen=True)
class Pipeline(Generic[T]):
    name: str
    steps: tuple[tuple[Any, ...], ...] = ()

    def _append(self, step: tuple[Any, ...]) -> Pipeline[Any]:
        return replace(self, steps=(*self.steps,step))

    def exec(self, program: str, *arguments: str) -> Pipeline[str]:
        for value in (program,*arguments):
            if not isinstance(value,str) or '\0' in value:
                raise ValueError('exec requires literal NUL-free strings')
        if not program: raise ValueError('exec requires a program')
        return self._append(('exec',(program,*arguments)))

    def workdir(self, path: str) -> Pipeline[T]:
        if not path or '\0' in path: raise ValueError('Invalid working directory')
        return self._append(('workdir',path))

    def env(self, key: str, value: str) -> Pipeline[T]:
        if not key or '=' in key or '\0' in key+value: raise ValueError('Invalid environment')
        return self._append(('env',key,value))

    def map(self, project: Callable[[T], U]) -> Pipeline[U]:
        return self._append(('map',project))

    def ensuring(self, cleanup: Callable[[], None]) -> Pipeline[T]:
        return self._append(('cleanup',cleanup))

    def module(self, name: str, args: A | Callable[[T], A], call: Callable[[A], U], *, project: bool = False, run_dir: bool = False, setup: bool = False) -> Pipeline[U]:
        return self._append(('module',name,deepcopy(args),call,project,run_dir,setup))

    def run(self) -> T:
        from . import _imports as api
        from .pipeline import pipeline as native_pipeline
        value: Any = None
        directory='.'
        cleanups=[step[1] for step in self.steps if step[0]=='cleanup']
        saved: dict[str, tuple[bool, str]] = {}
        run_id=str(time_ns())
        failure: BaseException | None = None
        def set_env(key: str, data: str) -> None:
            if key not in saved:saved[key]=(json.loads(api.has_env(key)),api.get_env(key))
            api.set_envs(json.dumps([[key,data]]))
        try:
            for index,step in enumerate(self.steps):
                kind=step[0]
                if kind=='workdir':directory=step[1]
                elif kind=='env':set_env(step[1],step[2])
                elif kind=='exec':value=native_pipeline(self.name).with_workdir(directory).exec(*step[1]).stdout()
                elif kind=='map':value=step[1](value)
                elif kind=='cleanup':pass
                elif kind=='module':
                    _,name,args,call,inherit_project,allocate_run,setup=step
                    args=deepcopy(args(value) if callable(args) else args)
                    if inherit_project and args.get('project') is None:args['project']=directory
                    if allocate_run and args.get('run_dir') is None:args['run_dir']=f'.fluentci/runs/{run_id}/{index}'
                    value=call(args)
                    if setup:
                        for entry in getattr(value,'environment',[]):set_env(entry.name,entry.value)
                else:raise ValueError(f'Unknown pipeline operation: {kind}')
        except BaseException as error:failure=error
        finally:
            for cleanup in reversed(cleanups):
                try:cleanup()
                except BaseException as error:
                    if failure is None:failure=error
            for key,(present,previous) in reversed(list(saved.items())):
                try:
                    if present:api.set_envs(json.dumps([[key,previous]]))
                    else:api.remove_env(key)
                except BaseException as error:
                    if failure is None:failure=error
        if failure is not None:raise failure
        # Each append changes the public output type to match its final step.
        # The heterogeneous interpreter erases that type internally.
        return cast(T, value)


def pipeline(name: str) -> Pipeline[None]:
    if not name or '\0' in name:raise ValueError('Invalid pipeline name')
    return Pipeline(name)
