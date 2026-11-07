module Main where

import Prelude

-- | Greet someone from a native Wasm component.
-- | @param name Name to greet.
hello :: { name :: String } -> String
hello args = "Hello, " <> args.name <> "!"
