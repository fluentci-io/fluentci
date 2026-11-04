module CI.Studio (install, build) where

import Prelude
import CI.Support (runIn)
import Effect (Effect)

install :: Effect Unit
install = runIn "studio-install" "webui"
  [ [ "bun", "install", "--frozen-lockfile", "--ignore-scripts" ] ]

build :: Effect Unit
build = do
  install
  runIn "studio-build" "webui" [ [ "bun", "run", "build:web" ] ]
