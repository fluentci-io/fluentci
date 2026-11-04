module CI.Support (run, runIn, unwrap, requiredEnv) where

import Prelude
import Data.Foldable (foldl)
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

unwrap :: forall a. P.Result a -> Effect a
unwrap = case _ of
  Left error -> throw (P.errorMessage error)
  Right value -> pure value

runIn :: String -> String -> Array (Array String) -> Effect Unit
runIn name directory commands = do
  let pipeline = foldl (flip P.exec) (P.pipeline name # P.withWorkdir directory) commands
  P.stdout (pipeline # P.exec [ "printf", "%s\n", name <> " completed" ]) >>= unwrap >>= P.output >>= unwrap

run :: String -> Array (Array String) -> Effect Unit
run name = runIn name "."

requiredEnv :: String -> Effect String
requiredEnv name = do
  present <- P.hasEnv name >>= unwrap
  if not present then throw ("Set " <> name <> " before running this job") else do
    value <- P.getEnv name >>= unwrap
    if value == "" then throw ("Set " <> name <> " before running this job") else pure value
