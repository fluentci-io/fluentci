module CI.Gemfury (dependencies, package, upload, github) where

import Prelude
import CI.Support (requiredEnv, run, unwrap)
import CI.LinuxPackages as Packages
import Data.Foldable (all)
import Data.String.CodeUnits as CU
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
package = Packages.package

upload :: Effect Unit
upload = do
  present <- P.hasEnv "FURY_TOKEN" >>= unwrap
  token <- if present then P.getEnv "FURY_TOKEN" >>= unwrap else pure ""
  if trim token == "" then
    P.output "Skipping Gemfury upload: FURY_TOKEN is not set." >>= unwrap
  else do
    config <- Packages.configuration
    user <- requiredEnv "FURY_USER"
    account <- requiredEnv "FURY_ACCOUNT"
    let alphaNum c = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
    unless (all (\c -> alphaNum c || c == '-' || c == '_') (CU.toCharArray account)) $ throw "Invalid Gemfury account name"
    unless (all (\c -> alphaNum c || c == '-' || c == '_' || c == '.' || c == '@' || c == '+') (CU.toCharArray user)) $ throw "Invalid Gemfury authentication user"
    -- Check both files before either upload; curl reads credentials from the
    -- environment, never from interpolated command text or a serialized plan.
    let uploadFile path =
          [ "curl", "--fail-with-body", "--silent", "--show-error"
          , "--variable", "%FURY_USER", "--variable", "%FURY_TOKEN"
          , "--expand-user", "{{FURY_USER}}:{{FURY_TOKEN}}"
          , "--form", "package=@\"" <> path <> "\"", "https://push.fury.io/" <> account <> "/" ]
    run "gemfury-upload"
      [ [ "test", "-s", config.deb ], [ "test", "-s", config.rpm ]
      , uploadFile config.deb, uploadFile config.rpm ]

github :: Effect Unit
github = do
  config <- Packages.configuration
  _ <- requiredEnv "GH_TOKEN"
  run "linux-package-github-upload"
    [ [ "gh", "release", "upload", config.tag ] <> Packages.files config <> [ "--clobber" ] ]
