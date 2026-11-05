module CI.Rust (format, lint, test, check, build) where

import Prelude
import CI.Studio as Studio
import CI.Support (run)
import Effect (Effect)

format :: Effect Unit
format = run "rust-format" [ [ "cargo", "fmt", "--all", "--check" ] ]

lintCommand :: Array String
lintCommand = [ "cargo", "clippy", "--release", "--all-targets", "--locked", "--", "-D", "warnings" ]

testCommand :: Array String
testCommand = [ "cargo", "test", "--release", "--locked" ]

lint :: Effect Unit
lint = Studio.build *> run "rust-lint" [ lintCommand ]

test :: Effect Unit
test = Studio.build *> run "rust-test" [ testCommand ]

check :: Effect Unit
check = do
  Studio.build
  format
  run "rust-check" [ lintCommand, testCommand ]

build :: Effect Unit
build = Studio.build *> run "rust-build" [ [ "cargo", "build", "--release", "--locked" ] ]
