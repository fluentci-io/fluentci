module CI.Rust (format, lint, test, check, build) where

import Prelude
import CI.Studio as Studio
import CI.Support (run)
import Effect (Effect)

-- | Check Rust formatting across the workspace.
format :: Effect Unit
format = run "rust-format" [ [ "cargo", "fmt", "--all", "--check" ] ]

lintCommand :: Array String
lintCommand = [ "cargo", "clippy", "--release", "--all-targets", "--locked", "--", "-D", "warnings" ]

testCommand :: Array String
testCommand = [ "cargo", "test", "--release", "--locked" ]

-- | Build Studio and run strict release Clippy checks.
lint :: Effect Unit
lint = Studio.build *> run "rust-lint" [ lintCommand ]

-- | Build Studio and run locked release Rust tests.
test :: Effect Unit
test = Studio.build *> run "rust-test" [ testCommand ]

-- | Build Studio and run formatting, Clippy, and Rust tests.
check :: Effect Unit
check = do
  Studio.build
  format
  run "rust-check" [ lintCommand, testCommand ]

-- | Build Studio and the CLI in locked release mode.
build :: Effect Unit
build = Studio.build *> run "rust-build" [ [ "cargo", "build", "--release", "--locked" ] ]
