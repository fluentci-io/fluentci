module CI.Gemfury (dependencies, package, upload, github) where

import Prelude
import CI.Support (requiredArgument, requiredEnv, run, unwrap)
import CI.LinuxPackages as Packages
import Data.Either (Either(..))
import Data.Foldable (all)
import Data.String.CodeUnits as CU
import Data.String.Common (trim)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

linuxTarget :: String -> Effect Unit
linuxTarget target = do
  case target of
    "x86_64-unknown-linux-gnu" -> pure unit
    "aarch64-unknown-linux-gnu" -> pure unit
    _ -> throw "Gemfury packages support x86_64 and aarch64 Linux targets only"

-- | Install native Linux packaging tools.
-- | @param target Rust target triple for the build or release.
dependencies :: { target :: String } -> Effect Unit
dependencies args = do
  linuxTarget args.target
  run "gemfury-package-tools"
    [ [ "sudo", "apt-get", "update" ]
    , [ "sudo", "apt-get", "install", "--yes", "dpkg-dev", "rpm" ]
    ]

-- | Create Debian and RPM packages with checksums.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
package :: { target :: String, version :: String } -> Effect Unit
package args = configuration args >>= Packages.packageWith

-- | Upload Debian and RPM packages to Gemfury when authenticated.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
-- | @param account Gemfury account receiving the packages.
upload :: { target :: String, version :: String, account :: String } -> Effect Unit
upload args = do
  present <- P.hasEnv "FURY_TOKEN" >>= unwrap
  token <- if present then P.getEnv "FURY_TOKEN" >>= unwrap else pure ""
  if trim token == "" then
    P.output "Skipping Gemfury upload: FURY_TOKEN is not set." >>= unwrap
  else do
    config <- configuration { target: args.target, version: args.version }
    user <- requiredEnv "FURY_USER"
    account <- requiredArgument "FURY_ACCOUNT" args.account
    let alphaNum c = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
    unless (all (\c -> alphaNum c || c == '-' || c == '_') (CU.toCharArray account)) $ throw "Invalid Gemfury account name"
    unless (all (\c -> alphaNum c || c == '-' || c == '_' || c == '.' || c == '@' || c == '+') (CU.toCharArray user)) $ throw "Invalid Gemfury authentication user"
    -- Check both files before either upload; curl reads credentials from the
    -- environment, never from interpolated command text or a serialized plan.
    let
      uploadFile path =
        [ "curl"
        , "--fail-with-body"
        , "--silent"
        , "--show-error"
        , "--variable"
        , "%FURY_USER"
        , "--variable"
        , "%FURY_TOKEN"
        , "--expand-user"
        , "{{FURY_USER}}:{{FURY_TOKEN}}"
        , "--form"
        , "package=@\"" <> path <> "\""
        , "https://push.fury.io/" <> account <> "/"
        ]
    run "gemfury-upload"
      [ [ "test", "-s", config.deb ]
      , [ "test", "-s", config.rpm ]
      , uploadFile config.deb
      , uploadFile config.rpm
      ]

-- | Upload Debian and RPM packages to the GitHub release.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
github :: { target :: String, version :: String } -> Effect Unit
github args = do
  config <- configuration { target: args.target, version: args.version }
  _ <- requiredEnv "GH_TOKEN"
  run "linux-package-github-upload"
    [ [ "gh", "release", "upload", config.tag ] <> Packages.files config <> [ "--clobber" ] ]

configuration :: { target :: String, version :: String } -> Effect Packages.Config
configuration args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  case Packages.configurationFor target version of
    Left error -> throw error
    Right config -> pure config
