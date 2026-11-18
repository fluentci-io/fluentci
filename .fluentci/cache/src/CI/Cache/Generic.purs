module CI.Cache.Generic where

import Prelude
import CI.CacheHost as H
import CI.Cache.Connection as C
import CI.Cache.IO as IO
import Control.Promise (toAffE)
import Data.Array as A
import Data.Either (Either(..))
import Data.String as S
import Data.String.Pattern (Pattern(..))
import Effect.Aff (Aff, attempt, bracket, throwError)

type Result = { key :: String, path :: String, hit :: Boolean, bytes :: String }

objectUrl :: C.Connection -> String -> Aff String
objectUrl c key = do
  let parts = S.split (Pattern "/") key
  H.ensureA (S.length key > 0 && S.length key <= 1024 && A.all (H.matches "^[A-Za-z0-9._-]+$") parts && A.all (\p -> p /= "." && p /= "..") parts) "Cache key must contain safe nonempty path segments"
  pure (c.base <> "/generic/" <> S.joinWith "/" (map IO.encode parts))

save :: H.Env -> String -> String -> String -> String -> Aff Result
save env base key path compression = do
  c <- C.connection env base
  url <- objectUrl c key
  H.ensureA (A.elem compression [ "zstd", "gzip", "none" ]) "Compression must be zstd, gzip or none"
  H.ensureA (S.trim path /= "") "Set a cache source path"
  bracket (toAffE (IO.pack path compression)) (\p -> toAffE (IO.remove p.directory)) \p -> do
    H.uploadFile IO.hooks p.file url c.token 4 7500000.0
    pure { key, path, hit: true, bytes: p.bytes }

restore :: H.Env -> String -> String -> String -> Boolean -> Aff Result
restore env base key path required = do
  c <- C.connection env base
  url <- objectUrl c key
  H.ensureA (S.trim path /= "") "Set a restore destination path"
  let
    fetch index = do
      outcome <- attempt (toAffE (IO.download url c.token))
      case outcome of
        Left error | H.transportError error && index < 3 -> toAffE (H.wait IO.hooks 1000.0) *> fetch (index + 1)
        Left error -> throwError error
        Right response | H.retryableStatus response.status && index < 3 -> toAffE (H.wait IO.hooks 1000.0) *> fetch (index + 1)
        Right response -> pure response
  response <- fetch 0
  if response.status == 404 then do
    H.ensureA (not required) "Required cache entry was not found"
    pure { key, path, hit: false, bytes: "0" }
  else do
    H.ensureA (H.success response.status) ("Cache restore failed: HTTP " <> show response.status)
    bracket (pure response) (\p -> toAffE (IO.remove p.directory)) \p -> do
      bytes <- toAffE (IO.unpack p.file path)
      pure { key, path, hit: true, bytes }
