module Main where
import Prelude
import Effect (Effect)
import Effect.Exception (throw)
import Data.Either (Either(..))
import FluentCI.Plugin as P
parity :: Effect String
parity = do
  result <- P.stdout $ P.exec ["printf", "capability-parity"] $ P.pipeline "component-parity"
  case result of
    Left error -> throw (P.errorMessage error)
    Right text -> pure text

hello :: { name :: String } -> String
hello args = "Hello, " <> args.name <> "!"
