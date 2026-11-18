module CI.NixBuild (build) where

import Prelude (Unit)
import CI.Support (run)
import Effect (Effect)

-- | Build with public FluentCI cache reads and optional signed uploads.
build :: Effect Unit
build = run "nix-build" [ [ "node", ".fluentci/nix-build/dist/nix-cache-host.mjs" ] ]
