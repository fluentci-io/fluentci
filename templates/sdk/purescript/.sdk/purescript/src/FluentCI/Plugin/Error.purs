module FluentCI.Plugin.Error (PluginError(..), Detail, errorMessage, fromWireError) where

import Prelude

type Detail = { operation :: String, message :: String }

data PluginError
  = InvalidArgument Detail
  | MissingHostFunction Detail
  | InvalidHostResponse Detail
  | HostFailure Detail

derive instance eqPluginError :: Eq PluginError

instance showPluginError :: Show PluginError where
  show = errorMessage

errorMessage :: PluginError -> String
errorMessage error = case error of
  InvalidArgument detail -> render "Invalid argument" detail
  MissingHostFunction detail -> render "Missing host function" detail
  InvalidHostResponse detail -> render "Invalid host response" detail
  HostFailure detail -> render "Host failure" detail
  where
  render label detail = label <> " (" <> detail.operation <> "): " <> detail.message

fromWireError :: String -> String -> String -> PluginError
fromWireError kind operation message =
  let detail = { operation, message }
  in case kind of
    "invalid-input" -> InvalidArgument detail
    "missing-host" -> MissingHostFunction detail
    "invalid-response" -> InvalidHostResponse detail
    _ -> HostFailure detail
