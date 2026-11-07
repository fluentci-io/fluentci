module CI.LinuxPackages (Config, configurationFor, packageWith, files) where

import Prelude
import CI.Support (run, unwrap)
import Data.Either (Either(..), either)
import Data.Foldable (all)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String.CodeUnits as CU
import Data.String.Common (joinWith, replaceAll, trim)
import Data.String.Pattern (Pattern(..), Replacement(..))
import Data.String.Regex as Regex
import Data.String.Regex.Flags (noFlags)
import Data.String (stripPrefix)
import Effect (Effect)
import Effect.Exception (throw, throwException, try)
import FluentCI.Host.Client (RunOutcome(..))
import FluentCI.Host.Files as Files
import FluentCI.Host.Plan as Plan
import FluentCI.Plugin as P

type Config =
  { tag :: String
  , version :: String
  , packageVersion :: String
  , debArch :: String
  , rpmArch :: String
  , binary :: String
  , deb :: String
  , rpm :: String
  }

configurationFor :: String -> String -> Either String Config
configurationFor target tag = do
  arch <- case target of
    "x86_64-unknown-linux-gnu" -> Right { deb: "amd64", rpm: "x86_64" }
    "aarch64-unknown-linux-gnu" -> Right { deb: "arm64", rpm: "aarch64" }
    _ -> Left "Gemfury packages support x86_64 and aarch64 Linux targets only"
  let version = fromMaybe tag (stripPrefix (Pattern "v") tag)
  pattern <- Regex.regex "^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$" noFlags
  unless (Regex.test pattern version) $ Left "Expected a semantic release version, for example v0.17.0"
  pure
    { tag
    , version
    , packageVersion: replaceAll (Pattern "-") (Replacement "~") version
    , debArch: arch.deb
    , rpmArch: arch.rpm
    , binary: "target/" <> target <> "/release/fluentci"
    , deb: "target/release-assets/fluentci_" <> version <> "_" <> arch.deb <> ".deb"
    , rpm: "target/release-assets/fluentci-" <> version <> "-1." <> arch.rpm <> ".rpm"
    }

files :: Config -> Array String
files config = [ config.deb, config.rpm, config.deb <> ".sha256", config.rpm <> ".sha256" ]

capture :: String -> Array String -> Effect String
capture name args = do
  output <- P.pipeline name # P.exec args # P.stdout >>= unwrap
  pure (trim output)

-- Native file tasks write literal contents, without redirection, shell parsing,
-- JavaScript FFI, or a generated shell script.
writeFiles :: String -> Array Plan.Task -> Effect Unit
writeFiles directory tasks = do
  result <- P.runPlan directory (Plan.plan tasks) >>= unwrap
  unless (result.outcome == Just RunSucceeded) $ throw "Writing Linux package metadata failed"

debianControl :: Config -> String
debianControl config = joinWith "\n"
  [ "Package: fluentci"
  , "Version: " <> config.packageVersion
  , "Section: devel"
  , "Priority: optional"
  , "Architecture: " <> config.debArch
  , "Maintainer: Tsiry Sandratraina <tsiry.sndr@fluentci.io>"
  , "Homepage: https://github.com/fluentci-io/fluentci"
  , "Depends: libc6 (>= 2.39), libgcc-s1"
  , "Description: Programmable CI/CD with WebAssembly plugins and FluentCI Studio"
  , " Build, test, and deploy pipelines locally or on a CI runner."
  , " Includes the FluentCI CLI and its embedded Studio web interface."
  , ""
  ]

rpmSpec :: Config -> String
rpmSpec config = joinWith "\n"
  [ "Name: fluentci"
  , "Version: " <> config.packageVersion
  , "Release: 1"
  , "Summary: Programmable CI/CD with WebAssembly plugins and FluentCI Studio"
  , "License: MPL-2.0"
  , "URL: https://github.com/fluentci-io/fluentci"
  , "BuildArch: " <> config.rpmArch
  , "Requires: glibc >= 2.39"
  , "Requires: libgcc"
  , "%global _build_id_links none"
  , "%global __os_install_post %{nil}"
  , ""
  , "%description"
  , "Build, test, and deploy pipelines locally or on a CI runner."
  , "Includes the FluentCI CLI and its embedded Studio web interface."
  , ""
  , "%prep"
  , "%build"
  , "%install"
  , "mkdir -p \"%{buildroot}\""
  , "cp -a \"%{_sourcedir}/root/.\" \"%{buildroot}/\""
  , ""
  , "%files"
  , "%license /usr/share/licenses/fluentci/LICENSE"
  , "/usr/bin/fluentci"
  , ""
  ]

verify :: String -> Array String -> String -> Effect Unit
verify name args expected = do
  actual <- capture ("verify-" <> name) args
  unless (actual == expected) $ throw ("Linux package " <> name <> " mismatch: expected " <> expected <> ", received " <> actual)

checksum :: String -> String -> String -> String -> Effect Plan.Task
checksum root taskId path filename = do
  rawDigest <- P.sha256 (P.file (root <> "/" <> path)) >>= unwrap
  let digest = trim rawDigest
  unless (CU.length digest == 64 && all (\c -> (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) (CU.toCharArray digest)) $
    throw "Invalid SHA-256 response while packaging Linux release"
  pure $ Files.writeText taskId (path <> ".sha256") (digest <> "  " <> filename <> "\n") true root

build :: Config -> String -> String -> Effect Unit
build config root stage = do
  let
    deb = root <> "/" <> config.deb
    rpm = root <> "/" <> config.rpm
    rpmTop = stage <> "/rpm"
  run "linux-package-stage"
    [ [ "mkdir"
      , "-p"
      , root <> "/target/release-assets"
      , stage <> "/root/usr/bin"
      , stage <> "/root/usr/share/licenses/fluentci"
      , stage <> "/root/DEBIAN"
      , rpmTop <> "/BUILD"
      , rpmTop <> "/BUILDROOT"
      , rpmTop <> "/RPMS"
      , rpmTop <> "/SOURCES"
      , rpmTop <> "/SPECS"
      , rpmTop <> "/SRPMS"
      ]
    , [ "install", "-m", "755", root <> "/" <> config.binary, stage <> "/root/usr/bin/fluentci" ]
    , [ "install", "-m", "644", root <> "/LICENSE", stage <> "/root/usr/share/licenses/fluentci/LICENSE" ]
    ]
  writeFiles (stage <> "/metadata-run")
    [ Files.writeText "debian-control" "root/DEBIAN/control" (debianControl config) true stage
    , Files.writeText "rpm-spec" "rpm/SPECS/fluentci.spec" (rpmSpec config) true stage
    ]
  run "linux-package-deb"
    [ [ "chmod", "644", stage <> "/root/DEBIAN/control", rpmTop <> "/SPECS/fluentci.spec" ]
    , [ "dpkg-deb", "--build", "--root-owner-group", stage <> "/root", deb ]
    ]
  verify "Debian architecture" [ "dpkg-deb", "--field", deb, "Architecture" ] config.debArch
  verify "Debian version" [ "dpkg-deb", "--field", deb, "Version" ] config.packageVersion
  run "linux-package-rpm"
    [ [ "rm", "-rf", "--", stage <> "/root/DEBIAN" ]
    , [ "cp", "-a", stage <> "/root", rpmTop <> "/SOURCES/root" ]
    , [ "rpmbuild", "--define", "_topdir " <> rpmTop, "--target", config.rpmArch, "-bb", rpmTop <> "/SPECS/fluentci.spec" ]
    , [ "install", "-m", "644", rpmTop <> "/RPMS/" <> config.rpmArch <> "/fluentci-" <> config.packageVersion <> "-1." <> config.rpmArch <> ".rpm", rpm ]
    ]
  verify "RPM architecture" [ "rpm", "--query", "--package", "--queryformat", "%{ARCH}", rpm ] config.rpmArch
  verify "RPM version" [ "rpm", "--query", "--package", "--queryformat", "%{VERSION}", rpm ] config.packageVersion
  debChecksum <- checksum root "deb-checksum" config.deb ("fluentci_" <> config.version <> "_" <> config.debArch <> ".deb")
  rpmChecksum <- checksum root "rpm-checksum" config.rpm ("fluentci-" <> config.version <> "-1." <> config.rpmArch <> ".rpm")
  writeFiles (stage <> "/checksum-run") [ debChecksum, rpmChecksum ]

packageWith :: Config -> Effect Unit
packageWith config = do
  run "linux-package-preflight" [ [ "test", "-x", config.binary ] ]
  root <- capture "linux-package-root" [ "pwd", "-P" ]
  stage <- capture "linux-package-temp" [ "mktemp", "-d" ]
  unless (CU.take 1 stage == "/" && stage /= "/" && stage /= root) $ throw "Invalid package staging directory"
  result <- try (build config root stage)
  cleanup <- try (run "linux-package-cleanup" [ [ "rm", "-rf", "--", stage ] ])
  case result of
    Left error -> throwException error
    Right _ -> either throwException pure cleanup
