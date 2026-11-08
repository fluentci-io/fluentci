module CI.NixBuild (build) where

import Prelude
import CI.Support (run, unwrap)
import Data.Foldable (all)
import Data.String.CodeUnits as String
import Data.String.Common (trim)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

hasToken :: Effect Boolean
hasToken = do
  present <- P.hasEnv "CACHIX_AUTH_TOKEN" >>= unwrap
  if not present then pure false
  else do
    token <- P.getEnv "CACHIX_AUTH_TOKEN" >>= unwrap
    pure (trim token /= "")

validateCache :: String -> Effect Unit
validateCache cache = do
  let valid = String.length cache > 0 && String.length cache <= 63
        && String.take 1 cache /= "-"
        && String.drop (String.length cache - 1) cache /= "-"
        && all (\c -> (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') (String.toCharArray cache)
  unless valid $ throw "Cachix cache name must be a lowercase DNS label (1–63 letters, digits or hyphens)."

-- | Build FluentCI with Cachix upload of build paths and the result closure.
-- | @param cache Cachix cache name, for example fluentci.
build :: { cache :: String } -> Effect Unit
build args = do
  validateCache args.cache
  enabled <- hasToken
  let command = [ "nix", "build", "--no-write-lock-file", ".#fluentci" ]
  if enabled then do
    -- setup-cachix installs and exports cachix before this job starts.
    run "nix-build-cachix" [ [ "cachix", "watch-exec", args.cache, "--" ] <> command ]
    run "cachix-push" [ [ "cachix", "push", args.cache, "./result" ] ]
  else run "nix-build" [ command ]
