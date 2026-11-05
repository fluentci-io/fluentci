export const examples = [
  {
    name: "ClojureScript",
    sdk: "clojurescript",
    file: "src/main/plugin.cljc",
    language: "clojurescript",
    pipe: "The -> macro threads the immutable pipeline through each function. Terminal functions end in !.",
    code: `(ns ^:typed.clojure main.plugin
  (:require [fluentci.plugin :as p]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann hello [-> nil]))
(defn hello []
  (-> (p/pipeline "hello")
      (p/exec ["echo" "Hello from FluentCI"])
      (p/exec ["git" "status" "--short"])
      p/stdout!
      p/output!))`,
  },
  {
    name: "PureScript",
    sdk: "purescript",
    file: "src/Main.purs",
    language: "purescript",
    pipe: "The # operator passes the pipeline into the next step.",
    code: `module Main where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

hello :: Effect Unit
hello = do
  result <- P.pipeline "hello"
    # P.exec ["echo", "Hello from FluentCI"]
    # P.exec ["git", "status", "--short"]
    # P.stdout
  case result of
    Left error -> throw (P.errorMessage error)
    Right output -> void (P.output output)`,
  },
  {
    name: "Python",
    sdk: "python",
    file: "plugin.py",
    language: "python",
    pipe: "Chain .exec() calls; .stdout() runs the pipeline and returns its output.",
    code: `import extism
from fluentci import pipeline


@extism.plugin_fn
def hello() -> None:
    output = (
        pipeline("hello")
        .exec("echo", "Hello from FluentCI")
        .exec("git", "status", "--short")
        .stdout()
    )
    extism.output_str(output)`,
  },
  {
    name: "TypeScript",
    sdk: "typescript",
    file: "entry.ts",
    language: "typescript",
    pipe: "Chain .withExec() calls; .stdout() executes the steps in order.",
    code: `import { dag } from "./.sdk/typescript/src/plugin.ts";

export function hello() {
  const output = dag
    .pipeline("hello")
    .withExec(["echo", "Hello from FluentCI"])
    .withExec(["git", "status", "--short"])
    .stdout();

  Host.outputString(output);
}`,
  },
  {
    name: "Gleam",
    sdk: "gleam",
    file: "src/plugin.gleam",
    language: "gleam",
    pipe: "The |> operator pipes each result into the next function.",
    code: `import fluentci/plugin

pub fn hello() -> Result(String, String) {
  plugin.pipeline("hello")
  |> plugin.exec("echo", ["Hello from FluentCI"])
  |> plugin.exec("git", ["status", "--short"])
  |> plugin.stdout
}`,
  },
  {
    name: "Elixir",
    sdk: "elixir",
    file: "lib/main.ex",
    language: "elixir",
    pipe: "The |> operator composes steps; defplugin exports the job to Wasm.",
    code: `defmodule Main do
  use FluentCI.Plugin

  defplugin hello do
    pipeline("hello")
    |> exec(["echo", "Hello from FluentCI"])
    |> exec(["git", "status", "--short"])
    |> stdout()
  end
end`,
  },
  {
    name: "ReScript",
    sdk: "rescript",
    file: "src/Greeting.res",
    language: "rescript",
    pipe: "The -> operator pipes the pipeline into the first argument of the next function.",
    code: `@val @scope("Host")
external output: string => unit = "outputString"

let hello = () => {
  switch Guest.pipeline("hello")
    ->Guest.exec(["echo", "Hello from FluentCI"])
    ->Guest.exec(["git", "status", "--short"])
    ->Guest.stdout {
  | Ok(value) => output(value)
  | Error(message) => JsError.throwWithMessage(message)
  }
}`,
  },
] as const;
