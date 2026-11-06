module CI.Cachix (setup, setupWith, push, pushResultWith, runWithCache) where

import Prelude
import CI.Support (run, unwrap, requiredEnv)
import Data.Foldable (all)
import Data.String.CodeUnits as String
import Data.String.Common (trim)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

-- The token is only inspected here. Cachix reads it from the host environment.
hasToken :: Effect Boolean
hasToken = do
  present <- P.hasEnv "CACHIX_AUTH_TOKEN" >>= unwrap
  if not present then pure false else do
    token <- P.getEnv "CACHIX_AUTH_TOKEN" >>= unwrap
    pure (trim token /= "")

withToken :: Effect Unit -> Effect Unit
withToken action = do
  enabled <- hasToken
  if enabled then action
  else P.output "Skipping Cachix: CACHIX_AUTH_TOKEN is not set." >>= unwrap

cacheInput :: Effect String
cacheInput = do
  input <- P.input >>= unwrap
  if trim input == "" then requiredEnv "CACHIX_CACHE" else pure (trim input)

validateCache :: String -> Effect Unit
validateCache cache = do
  let valid = String.length cache > 0 && String.length cache <= 63
        && String.take 1 cache /= "-"
        && String.drop (String.length cache - 1) cache /= "-"
        && all (\c -> (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') (String.toCharArray cache)
  unless valid $ throw "Cachix cache name must be a lowercase DNS label (1–63 letters, digits or hyphens)."

cachix :: Array String
cachix = [ "nix", "run", "--no-write-lock-file", "--inputs-from", ".", "nixpkgs#cachix", "--" ]

configure :: String -> Effect Unit
configure cache = do
  validateCache cache
  run "cachix-setup" [ cachix <> [ "use", cache ] ]

-- Composable PureScript function for callers that already have the cache name.
setupWith :: String -> Effect Unit
setupWith cache = withToken (configure cache)

-- CLI: fluentci run cachix setup CACHE_NAME; CACHIX_CACHE is a fallback.
setup :: Effect Unit
setup = withToken (cacheInput >>= configure)

-- Watch every new store path produced by the command, including build-time
-- dependencies such as Crane artifacts. The command still runs without a token.
runWithCache :: String -> Array String -> Effect Unit
runWithCache cache command = do
  enabled <- hasToken
  if enabled then do
    validateCache cache
    run "nix-build-cachix" [ cachix <> [ "watch-exec", cache, "--" ] <> command ]
  else run "nix-build" [ command ]

-- Explicitly push the final runtime closure too, even when no new paths were
-- built. Cachix propagates upload/authentication failures to the CI job.
pushResultWith :: String -> Effect Unit
pushResultWith cache = withToken do
  validateCache cache
  run "cachix-push" [ cachix <> [ "push", cache, "./result" ] ]

push :: Effect Unit
push = withToken (cacheInput >>= pushResultWith)
