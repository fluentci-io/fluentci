module FluentCI.Plugin.Plan (run) where

import Prelude
import Data.Argonaut.Decode (decodeJson)
import Data.Argonaut.Parser (jsonParser)
import Data.Either (Either(..))
import Effect (Effect)
import FluentCI.Host.Client (RunResult)
import FluentCI.Host.Plan as H
import FluentCI.Plugin.Error (PluginError(..), fromWireError)
import FluentCI.Plugin.Internal.Imports as Imports

foreign import executeImpl
  :: (String -> String -> Effect String)
  -> (String -> String -> String -> PluginError)
  -> (PluginError -> Either PluginError String)
  -> (String -> Either PluginError String)
  -> String -> String -> Effect (Either PluginError String)

-- | Run a complete independent plan in a fresh directory. Failed task reports
-- | are returned for inspection; transport/preflight failures return Left.
run :: String -> H.Plan -> Effect (Either PluginError RunResult)
run directory plan = case H.compile plan of
  Left error -> pure $ Left $ InvalidArgument { operation: "execute_plan", message: show error }
  Right encoded -> do
    response <- executeImpl Imports.invoke fromWireError Left Right directory encoded
    pure case response of
      Left error -> Left error
      Right text -> case jsonParser text of
        Left error -> Left $ InvalidHostResponse { operation: "execute_plan", message: error }
        Right json -> case decodeJson json of
          Left error -> Left $ InvalidHostResponse { operation: "execute_plan", message: show error }
          Right report -> Right report
