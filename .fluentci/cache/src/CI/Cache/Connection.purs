module CI.Cache.Connection where

import Prelude
import CI.CacheHost as H
import CI.Cache.IO as IO
import Control.Promise (toAffE)
import Data.Array as A
import Data.String as S
import Data.String.Pattern (Pattern(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)

type Connection = { base :: String, origin :: String, host :: String, actor :: String, token :: String }

connection :: H.Env -> String -> Aff Connection
connection env explicit = do
  let token = H.envValue env "FLUENTCI_CACHE_TOKEN"
  let base = S.trim (if S.trim explicit == "" then H.envValue env "FLUENTCI_CACHE_URL" else explicit)
  H.ensureA (token /= "" && H.matches "^[A-Za-z0-9._~-]+$" token) "Set FLUENTCI_CACHE_TOKEN in the environment"
  H.ensureA (base /= "") "Set --url or FLUENTCI_CACHE_URL"
  url <- liftEffect (IO.parseUrl base)
  let parts = A.drop 1 (S.split (Pattern "/") url.pathname)
  actor <- liftEffect (H.decodePart (H.part 0 parts))
  let legacy = A.length parts == 2 && actor == "accounts" && H.matches "^[a-f0-9]{64}$" (H.part 1 parts)
  let alias = A.length parts == 1 && (H.matches "^did:plc:[a-z2-7]{24}$" actor || H.matches "^did:web:[A-Za-z0-9._:%-]+$" actor || H.matches "^@?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$" actor)
  H.ensureA (url.protocol == "https:" && url.username == "" && url.password == "" && url.search == "" && url.hash == "" && (legacy || alias)) "Cache URL must be an HTTPS account base without a protocol suffix, query or credentials"
  let c = { base: url.base, origin: url.origin, host: url.host, actor: if legacy then H.part 1 parts else actor, token }
  owner <- ownerDid c
  pure (c { base = url.origin <> "/" <> S.replaceAll (Pattern "%3A") (S.Replacement ":") (IO.encode owner), actor = owner })

ownerDid :: Connection -> Aff String
ownerDid c
  | H.matches "^did:" c.actor = pure c.actor
  | otherwise = do
      response <- H.lookupResponse IO.hooks ("https://api.fluentci.io/xrpc/io.fluentci.cache.resolveAccount?actor=" <> IO.encode c.actor)
      H.ensureA (H.success (H.responseStatus response)) "Could not resolve cache owner"
      text <- toAffE (H.responseText response 16384.0)
      value <- liftEffect (IO.cacheOwner text)
      H.ensureA (H.matches "^did:(plc|web):" value) "Invalid resolved cache owner"
      pure value
