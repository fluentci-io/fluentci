module FluentCI.Host.Local (Progress(..), Config, LocalResult, execute) where

import Prelude
import Data.Argonaut.Decode (decodeJson)
import Data.Argonaut.Parser (jsonParser)
import Data.Either (Either(..))
import Effect.Aff (Aff, attempt)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import Effect.Exception (message)
import FluentCI.Host.Client (RunError(..), RunResult)
import FluentCI.Host.Plan as Plan

data Progress = Auto | Plain | Tui | Json
type Config = { binary :: String, runRoot :: String, progress :: Progress }
type LocalResult = { runDirectory :: String, result :: RunResult }
type WireConfig = { binary :: String, runRoot :: String, progress :: String }
foreign import executeImpl :: WireConfig -> String -> EffectFnAff { runDirectory :: String, report :: String }

-- Node.js adapter: starts the release engine directly, without a server.
execute :: Plan.Plan -> Config -> Aff (Either RunError LocalResult)
execute plan config = case Plan.compile plan of
  Left error -> pure (Left (InvalidPlan error))
  Right encoded -> do
    let progress = case config.progress of
          Auto -> "auto"
          Plain -> "plain"
          Tui -> "tui"
          Json -> "json"
    response <- attempt (fromEffectFnAff (executeImpl { binary: config.binary, runRoot: config.runRoot, progress } encoded))
    pure case response of
      Left error -> Left (TransportError (message error))
      Right value -> case jsonParser value.report of
        Left error -> Left (DecodeError error)
        Right json -> case decodeJson json of
          Left error -> Left (DecodeError (show error))
          Right result -> Right { runDirectory: value.runDirectory, result }
