module CI.Cachix (setup, setupWith) where

import Prelude
import CI.Support (run, unwrap, requiredEnv)
import Data.Foldable (all)
import Data.String.CodeUnits as String
import Data.String.Common (trim)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

-- The token is only inspected here. Cachix reads it from the host environment.
withToken :: Effect Unit -> Effect Unit
withToken action = do
  present <- P.hasEnv "CACHIX_AUTH_TOKEN" >>= unwrap
  if not present then skipped else do
    token <- P.getEnv "CACHIX_AUTH_TOKEN" >>= unwrap
    if trim token == "" then skipped else action
  where
  skipped = P.output "Skipping Cachix: CACHIX_AUTH_TOKEN is not set." >>= unwrap

configure :: String -> Effect Unit
configure cache = do
  let valid = String.length cache > 0 && String.length cache <= 63
        && String.take 1 cache /= "-"
        && String.drop (String.length cache - 1) cache /= "-"
        && all (\c -> (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') (String.toCharArray cache)
  unless valid $ throw "Cachix cache name must be a lowercase DNS label (1–63 letters, digits or hyphens)."
  -- Reuse the checkout's pinned nixpkgs input; no global installation is needed.
  run "cachix-setup"
    [ [ "nix", "run", "--no-write-lock-file", "--inputs-from", ".", "nixpkgs#cachix", "--", "use", cache ] ]

-- Composable PureScript function for callers that already have the cache name.
setupWith :: String -> Effect Unit
setupWith cache = withToken (configure cache)

-- CLI: fluentci run cachix setup CACHE_NAME; CACHIX_CACHE is a fallback.
setup :: Effect Unit
setup = withToken do
  input <- P.input >>= unwrap
  cache <- if trim input == "" then requiredEnv "CACHIX_CACHE" else pure (trim input)
  configure cache
