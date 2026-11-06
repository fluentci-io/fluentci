module CI.NixBuild (build) where

import Prelude (Unit, discard)
import CI.Cachix as Cachix
import Effect (Effect)

build :: Effect Unit
build = do
  Cachix.runWithCache "fluentci" [ "nix", "build", "--no-write-lock-file", ".#fluentci" ]
  Cachix.pushResultWith "fluentci"
