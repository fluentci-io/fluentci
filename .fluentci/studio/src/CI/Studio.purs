module CI.Studio (install, build) where

import Prelude
import CI.Support (runIn)
import Effect (Effect)

-- | Install Studio dependencies from the frozen Bun lockfile.
install :: Effect Unit
install = runIn "studio-install" "webui"
  [ [ "bun", "install", "--frozen-lockfile", "--ignore-scripts" ] ]

-- | Install dependencies and build embedded Studio web assets.
build :: Effect Unit
build = do
  install
  runIn "studio-build" "webui" [ [ "bun", "run", "build:web" ] ]
