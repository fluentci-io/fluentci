module CI.Cache where

import Prelude
import CI.Cache.HostProgram (hostProgram)
import Data.Argonaut.Core (Json, stringify)
import Data.Argonaut.Decode (decodeJson)
import Data.Argonaut.Encode (encodeJson)
import Data.Argonaut.Parser as Parser
import Data.Array as A
import Data.Either (Either, either)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String as S
import Data.String.CodeUnits as CU
import Data.String.Pattern (Pattern(..))
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P
import FluentCI.Plugin.Internal.Imports as Imports

unwrap :: forall a. P.Result a -> Effect a
unwrap = either (throw <<< P.errorMessage) pure

required :: String -> Effect String
required name = do
  present <- P.hasEnv name >>= unwrap
  value <- if present then P.getEnv name >>= unwrap else pure ""
  when (S.trim value == "") (throw ("Set " <> name))
  pure value

payloadChunks :: String -> Array String
payloadChunks value = if value == "" then [] else [ CU.take 40000 value ] <> payloadChunks (CU.drop 40000 value)

invoke :: forall a. String -> Maybe String -> a -> Effect Json
invoke operation url input = do
  _ <- required "FLUENTCI_CACHE_TOKEN"
  case url of
    Just value | S.trim value /= "" -> pure unit
    _ -> void (required "FLUENTCI_CACHE_URL")
  let bootstrap = "import {gunzipSync} from 'node:zlib';await import('data:text/javascript;base64,'+gunzipSync(Buffer.from(process.argv.slice(3).join(''),'base64')).toString('base64'));"
  output <- P.pipeline ("fluentci-cache-" <> operation) # P.exec ([ "node", "--input-type=module", "--eval", bootstrap, operation, stringify (encodeInput input) ] <> payloadChunks hostProgram) # P.stdout >>= unwrap
  let last = fromMaybe "" (A.last (S.split (Pattern "\n") (S.trim output)))
  either (throw <<< show) pure (Parser.jsonParser last)

foreign import encodeInput :: forall row. row -> Json

type Variable = { name :: String, value :: String }
type SetupResult = { protocol :: String, url :: String, configDir :: String, files :: Array String, binDir :: String, environment :: Array Variable }
type TransferResult = { key :: String, path :: String, hit :: Boolean, bytes :: String }

setup :: forall row. { url :: Maybe String | row } -> Effect SetupResult
setup args = do
  json <- invoke "setup" args.url args
  result <- either (throw <<< show) pure (decodeJson json :: Either _ { protocol :: String, url :: String, configDir :: String, files :: Array String, binDir :: String, environment :: Array Variable, secretNames :: Array String })
  token <- required "FLUENTCI_CACHE_TOKEN"
  publicPairs <- traverse
    ( \v ->
        if v.name == "NIX_CONFIG" then do
          present <- P.hasEnv "NIX_CONFIG" >>= unwrap
          previous <- if present then P.getEnv "NIX_CONFIG" >>= unwrap else pure ""
          pure [ v.name, previous <> "\n" <> v.value ]
        else pure [ v.name, v.value ]
    )
    result.environment
  let pairs = publicPairs <> map (\name -> [ name, token ]) result.secretNames
  Imports.set_envs (stringify (encodeJson pairs))
  pure { protocol: result.protocol, url: result.url, configDir: result.configDir, files: result.files, binDir: result.binDir, environment: result.environment }

nixBuild :: forall row. { url :: Maybe String | row } -> Effect { outcome :: String }
nixBuild args = invoke "nixBuild" args.url args >>= either (throw <<< show) pure <<< decodeJson

save :: forall row. { url :: Maybe String | row } -> Effect TransferResult
save args = invoke "save" args.url args >>= either (throw <<< show) pure <<< decodeJson

restore :: forall row. { url :: Maybe String | row } -> Effect TransferResult
restore args = invoke "restore" args.url args >>= either (throw <<< show) pure <<< decodeJson
