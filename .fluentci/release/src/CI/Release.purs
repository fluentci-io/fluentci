module CI.Release (prepare, build, buildPrepared, check, package, upload, linuxDependencies, reserveBsdDisk, bsdBuild, bsdVerify, bsdUpload) where

import Prelude
import CI.Studio as Studio
import CI.Support (requiredEnv, run, unwrap)
import Effect (Effect)
import FluentCI.Plugin as P

prepare :: Effect Unit
prepare = do
  version <- requiredEnv "RELEASE_VERSION"
  run "release-inputs"
    [ [ "sh", "-eu", "-c", """
case "$RELEASE_VERSION" in
  ''|*[!A-Za-z0-9._+-]*) echo 'Unsupported release tag' >&2; exit 1 ;;
esac
""" ]
    , [ "gh", "release", "view", version, "--json", "tagName", "--jq", ".tagName" ]
    , [ "python3", ".github/scripts/check-openbsd-msrv.py" ]
    , [ "python3", ".github/scripts/test-bsd-release-verification.py", "-v" ]
    , [ "python3", ".github/scripts/create-bsd-smoke-fixtures.py", ".release-smoke" ]
    ]
  Studio.build

build :: Effect Unit
build = do
  _ <- requiredEnv "TARGET"
  Studio.build
  buildPrepared

-- Platform jobs receive Studio assets from Ubuntu and never rebuild the UI.
buildPrepared :: Effect Unit
buildPrepared = do
  target <- requiredEnv "TARGET"
  run "release-build"
    [ [ "test", "-s", "webui/dist/index.html" ]
    , [ "cargo", "build", "--release", "--locked", "--target", target ]
    ]

check :: Effect Unit
check = do
  target <- requiredEnv "TARGET"
  let binary = "target/" <> target <> "/release/fluentci"
  run "release-check" [ [ binary, "--version" ], [ binary, "--help" ] ]

package :: Effect Unit
package = do
  target <- requiredEnv "TARGET"
  version <- requiredEnv "RELEASE_VERSION"
  let archive = "fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "release-stage"
    [ [ "mkdir", "-p", "target/release-assets/" <> target ]
    , [ "cp", "target/" <> target <> "/release/fluentci", "target/release-assets/" <> target <> "/fluentci" ]
    , [ "env", "COPYFILE_DISABLE=1", "tar", "czf", "target/release-assets/" <> archive, "-C", "target/release-assets/" <> target, "fluentci" ]
    ]
  P.pipeline "release-checksum"
    # P.withWorkdir "target/release-assets"
    # P.withEnv "ARCHIVE" archive
    # P.shell """
shasum -a 256 -- "$ARCHIVE" > "$ARCHIVE.sha256"
"""
    # P.exec [ "printf", "%s\n", "Job completed" ]
    # P.stdout >>= unwrap >>= P.output >>= unwrap

upload :: Effect Unit
upload = do
  target <- requiredEnv "TARGET"
  version <- requiredEnv "RELEASE_VERSION"
  let archive = "target/release-assets/fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "release-upload" [ [ "gh", "release", "upload", version, archive, archive <> ".sha256", "--clobber" ] ]

linuxDependencies :: Effect Unit
linuxDependencies = run "linux-build-dependencies"
  [ [ "sudo", "apt-get", "update" ]
  , [ "sudo", "apt-get", "install", "--yes", "build-essential", "cmake", "pkg-config" ]
  ]

reserveBsdDisk :: Effect Unit
reserveBsdDisk = run "bsd-runner-disk"
  [ [ "sudo", "rm", "-rf", "/usr/local/lib/android", "/usr/share/dotnet", "/usr/local/.ghcup", "/opt/ghc", "/opt/hostedtoolcache/CodeQL" ] ]

bsdBuild :: Effect Unit
bsdBuild = run "bsd-native-build" [ [ "sh", ".github/scripts/build-bsd-release.sh" ] ]

bsdVerify :: Effect Unit
bsdVerify = do
  target <- requiredEnv "TARGET"
  version <- requiredEnv "RELEASE_VERSION"
  run "bsd-verify" [ [ "python3", ".github/scripts/verify-bsd-release.py", "dist/bsd/" <> target, version, target ] ]

bsdUpload :: Effect Unit
bsdUpload = do
  target <- requiredEnv "TARGET"
  version <- requiredEnv "RELEASE_VERSION"
  let archive = "dist/bsd/" <> target <> "/fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "bsd-upload" [ [ "gh", "release", "upload", version, archive, archive <> ".sha256", "--clobber" ] ]
