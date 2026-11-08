module CI.NixBuild (build) where

import Prelude (Unit, discard)
import CI.Cachix as Cachix
import Effect (Effect)

-- | Build FluentCI with Cachix upload of build paths and the result closure.
-- | @param cache Cachix cache name, for example fluentci.
build :: { cache :: String } -> Effect Unit
build args = do
  Cachix.runWithCache args.cache [ "nix", "build", "--no-write-lock-file", ".#fluentci" ]
  Cachix.pushResultWith args.cache
