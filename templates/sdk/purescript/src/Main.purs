module Main where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

hello :: Effect Unit
hello = do
  result <- P.output "Hello from FluentCI"
  case result of
    Left error -> throw (P.errorMessage error)
    Right _ -> pure unit
