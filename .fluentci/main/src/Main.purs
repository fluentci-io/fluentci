module Main (check, build) where

import Prelude
import CI.Rust as Rust
import CI.Support (run)
import Effect (Effect)

-- The Rust jobs build Studio first, because the CLI embeds its web assets.
check :: Effect Unit
check = do
  run "ci-module-tests" [ [ "node", "--test", ".fluentci/tests/modules.test.mjs" ] ]
  Rust.check

build :: Effect Unit
build = Rust.build
