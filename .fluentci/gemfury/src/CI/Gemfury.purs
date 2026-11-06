module CI.Gemfury (dependencies, package, upload) where

import Prelude
import CI.Support (requiredEnv, run, unwrap)
import Data.String.Common (trim)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

linuxTarget :: Effect Unit
linuxTarget = do
  target <- requiredEnv "TARGET"
  case target of
    "x86_64-unknown-linux-gnu" -> pure unit
    "aarch64-unknown-linux-gnu" -> pure unit
    _ -> throw "Gemfury packages support x86_64 and aarch64 Linux targets only"

dependencies :: Effect Unit
dependencies = do
  linuxTarget
  run "gemfury-package-tools"
    [ [ "sudo", "apt-get", "update" ]
    , [ "sudo", "apt-get", "install", "--yes", "dpkg-dev", "rpm" ]
    ]

package :: Effect Unit
package = do
  linuxTarget
  _ <- requiredEnv "RELEASE_VERSION"
  run "gemfury-package" [ [ "bash", ".github/scripts/package-linux-release.sh" ] ]

upload :: Effect Unit
upload = do
  present <- P.hasEnv "FURY_TOKEN" >>= unwrap
  token <- if present then P.getEnv "FURY_TOKEN" >>= unwrap else pure ""
  if trim token == "" then
    P.output "Skipping Gemfury upload: FURY_TOKEN is not set." >>= unwrap
  else do
    linuxTarget
    _ <- requiredEnv "RELEASE_VERSION"
    _ <- requiredEnv "FURY_USER"
    _ <- requiredEnv "FURY_ACCOUNT"
    -- curl expands the token from the host environment, never the command plan.
    run "gemfury-upload" [ [ "bash", ".github/scripts/upload-gemfury.sh" ] ]
