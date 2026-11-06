module CI.NixBuild (build) where

import Prelude (Unit)
import CI.Support (run)
import Effect (Effect)

build :: Effect Unit
build = run "nix-build" [ [ "nix", "build", "--no-write-lock-file", ".#fluentci" ] ]
