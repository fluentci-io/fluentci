export const runExample =
  'fluentci run ci check \\\n  --run-dir "$(mktemp -d)/run"';

export const examples = [
  {
    name: "ClojureScript",
    sdk: "clojurescript",
    file: "src/main/plugin.cljc",
    language: "clojurescript",
    pipe: "The -> macro builds immutable tasks. Lint and tests share the install dependency; build waits for both.",
    code: `(ns ^:typed.clojure main.plugin
  (:require [fluentci.host :as h]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann check [(t/HMap :mandatory {:runDir t/Str}) -> t/Str]))
(defn check [{:keys [runDir]}]
  (let [step (fn [id args parents]
               (-> (h/task id "/usr/bin/python3" ".")
                   (h/with-args args)
                   (h/with-env "PYTHONPATH" ".ci-deps")
                   (h/after parents)))
        install (step "install" ["-m" "pip" "install" "--target" ".ci-deps"
                                "-r" "requirements-ci.txt"] [])
        lint (step "lint" ["-m" "ruff" "check" "src"] [install])
        tests (step "test" ["-m" "pytest"] [install])
        build (step "build" ["-m" "build" "--no-isolation"] [lint tests])]
    (-> (h/plan [install lint tests build])
        (h/with-jobs 2)
        (h/run! runDir)
        :outcome)))`,
  },
  {
    name: "PureScript",
    sdk: "purescript",
    file: "src/Main.purs",
    language: "purescript",
    pipe: "The # operator composes typed tasks. Two worker slots let lint and tests run together after installation.",
    code: `module Main where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Host.Plan as H
import FluentCI.Plugin.Error (errorMessage)
import FluentCI.Plugin.Plan as P

check :: { runDir :: String } -> Effect String
check args = do
  let
    step name command parents = H.task name "/usr/bin/python3" "."
      # H.withArgs command
      # H.withEnv "PYTHONPATH" ".ci-deps"
      # H.after parents
    install = step "install" ["-m", "pip", "install", "--target",
      ".ci-deps", "-r", "requirements-ci.txt"] []
    lint = step "lint" ["-m", "ruff", "check", "src"] [install]
    tests = step "test" ["-m", "pytest"] [install]
    build = step "build" ["-m", "build", "--no-isolation"] [lint, tests]
  result <- P.run args.runDir (H.plan [install, lint, tests, build] # H.withJobs 2)
  case result of
    Left error -> throw (errorMessage error)
    Right _ -> pure "CI finished"`,
  },
  {
    name: "Python",
    sdk: "python",
    file: "plugin.py",
    language: "python",
    pipe: "Frozen task values declare dependencies. The native scheduler runs independent checks in parallel.",
    code: `from dataclasses import dataclass
from fluentci.plan import Plan, Task

@dataclass
class CheckArgs:
    runDir: str


def check(args: CheckArgs) -> str:
    def step(name: str, command: tuple[str, ...], needs: tuple[str, ...] = ()) -> Task:
        return Task(name, "/usr/bin/python3", command, needs=needs).with_env(
            "PYTHONPATH", ".ci-deps")

    install = step("install", ("-m", "pip", "install", "--target",
                              ".ci-deps", "-r", "requirements-ci.txt"))
    lint = step("lint", ("-m", "ruff", "check", "src"), ("install",))
    tests = step("test", ("-m", "pytest"), ("install",))
    build = step("build", ("-m", "build", "--no-isolation"), ("lint", "test"))
    return Plan((install, lint, tests, build), jobs=2).run(args.runDir).outcome`,
  },
  {
    name: "TypeScript",
    sdk: "typescript",
    file: "entry.ts",
    language: "typescript",
    pipe: "Typed tasks form a dependency graph. after() declares ordering; run() submits the whole plan once.",
    code: `import { task, after, parallel, run, type Task } from "./.sdk/typescript/src/matrix";

interface CheckArgs {
  runDir: string;
}

export function check(args: CheckArgs): string {
  const step = (id: string, command: string[], parents: Task[] = []): Task =>
    after(parents, { ...task(id, "/usr/bin/python3", command),
      env: { PYTHONPATH: ".ci-deps" } });

  const install = step("install", ["-m", "pip", "install", "--target",
    ".ci-deps", "-r", "requirements-ci.txt"]);
  const lint = step("lint", ["-m", "ruff", "check", "src"], [install]);
  const tests = step("test", ["-m", "pytest"], [install]);
  const build = step("build", ["-m", "build", "--no-isolation"], [lint, tests]);

  return run(parallel([install, lint, tests, build], 2), args.runDir).outcome;
}`,
  },
  {
    name: "Gleam",
    sdk: "gleam",
    file: "src/plugin.gleam",
    language: "gleam",
    pipe: "The |> operator composes typed task values. A Result carries plan execution errors back to the caller.",
    code: `import fluentci/host as h
import fluentci/matrix
import gleam/result

pub type CheckArgs {
  CheckArgs(run_dir: String)
}

pub fn check(args: CheckArgs) -> Result(String, String) {
  let step = fn(name, command, parents) {
    h.task(name, "/usr/bin/python3", ".")
    |> h.with_args(command)
    |> h.with_env("PYTHONPATH", ".ci-deps")
    |> h.after_jobs(parents)
  }
  let install = step("install", ["-m", "pip", "install", "--target",
    ".ci-deps", "-r", "requirements-ci.txt"], [])
  let lint = step("lint", ["-m", "ruff", "check", "src"], [install])
  let tests = step("test", ["-m", "pytest"], [install])
  let build = step("build", ["-m", "build", "--no-isolation"], [lint, tests])
  matrix.parallel([install, lint, tests, build], 2)
  |> matrix.run(args.run_dir)
  |> result.map(fn(_) { "CI finished" })
}`,
  },
  {
    name: "Elixir",
    sdk: "elixir",
    file: "lib/main.ex",
    language: "elixir",
    pipe: "The |> operator declares task dependencies. defplugin compiles the plan into a native Wasm component.",
    code: `defmodule Main do
  use FluentCI.Plugin
  alias FluentCI.Host, as: H

  @doc "Install dependencies, check in parallel, then build a Python package."
  defplugin check do
    run_dir = argument("run-dir", "string")
    step = fn name, command, parents ->
      H.task(name, "/usr/bin/python3", ".")
      |> H.args(command)
      |> H.env(%{"PYTHONPATH" => ".ci-deps"})
      |> H.needs(parents)
    end
    install = step.("install", ["-m", "pip", "install", "--target",
      ".ci-deps", "-r", "requirements-ci.txt"], [])
    lint = step.("lint", ["-m", "ruff", "check", "src"], ["install"])
    tests = step.("test", ["-m", "pytest"], ["install"])
    build = step.("build", ["-m", "build", "--no-isolation"], ["lint", "test"])

    H.plan([install, lint, tests, build]) |> H.jobs(2) |> run_plan(run_dir)
  end
end`,
  },
  {
    name: "ReScript",
    sdk: "rescript",
    file: "src/Greeting.res",
    language: "rescript",
    pipe: "The -> operator builds immutable tasks. Pattern matching handles execution errors explicitly.",
    code: `type checkArgs = {runDir: string}

let check = (args: checkArgs): string => {
  let step = (name, command, parents) =>
    Matrix.task(name, "/usr/bin/python3", command, ".")
    ->Matrix.withEnv("PYTHONPATH", ".ci-deps")
    ->Matrix.afterJobs(parents)

  let install = step("install", ["-m", "pip", "install", "--target",
    ".ci-deps", "-r", "requirements-ci.txt"], [])
  let lint = step("lint", ["-m", "ruff", "check", "src"], [install])
  let tests = step("test", ["-m", "pytest"], [install])
  let build = step("build", ["-m", "build", "--no-isolation"], [lint, tests])

  switch Matrix.parallel([install, lint, tests, build], 2)
    ->Matrix.run(args.runDir) {
  | Ok(report) => report.outcome
  | Error(message) => JsError.throwWithMessage(message)
  }
}`,
  },
] as const;
