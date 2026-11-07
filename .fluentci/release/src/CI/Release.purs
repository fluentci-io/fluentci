module CI.Release (prepare, build, buildPrepared, check, package, upload, linuxDependencies, reserveBsdDisk, bsdBuild, bsdVerify, bsdUpload) where

import Prelude
import CI.Studio as Studio
import CI.Support (requiredArgument, run, unwrap)
import Effect (Effect)
import FluentCI.Plugin as P

-- | Validate release inputs and prepare Studio assets.
-- | @param version Release tag, for example v0.17.2.
prepare :: { version :: String } -> Effect Unit
prepare args = do
  version <- requiredArgument "RELEASE_VERSION" args.version
  run "release-inputs"
    [ [ "env"
      , "RELEASE_VERSION=" <> version
      , "sh"
      , "-eu"
      , "-c"
      , """
case "$RELEASE_VERSION" in
  ''|*[!A-Za-z0-9._+-]*) echo 'Unsupported release tag' >&2; exit 1 ;;
esac
"""
      ]
    , [ "gh", "release", "view", version, "--json", "tagName", "--jq", ".tagName" ]
    , [ "python3", ".github/scripts/check-openbsd-msrv.py" ]
    , [ "python3", ".github/scripts/test-bsd-release-verification.py", "-v" ]
    , [ "python3", ".github/scripts/create-bsd-smoke-fixtures.py", ".release-smoke" ]
    ]
  Studio.build

-- | Build Studio and the CLI for a release target.
-- | @param target Rust target triple for the build or release.
build :: { target :: String } -> Effect Unit
build args = do
  target <- requiredArgument "TARGET" args.target
  Studio.build
  buildPrepared { target }

-- Platform jobs receive Studio assets from Ubuntu and never rebuild the UI.
-- | Build the CLI using prepared Studio assets.
-- | @param target Rust target triple for the build or release.
buildPrepared :: { target :: String } -> Effect Unit
buildPrepared args = do
  target <- requiredArgument "TARGET" args.target
  run "release-build"
    [ [ "test", "-s", "webui/dist/index.html" ]
    , [ "cargo", "build", "--release", "--locked", "--target", target ]
    ]

-- | Check the built release binary.
-- | @param target Rust target triple for the build or release.
check :: { target :: String } -> Effect Unit
check args = do
  target <- requiredArgument "TARGET" args.target
  let binary = "target/" <> target <> "/release/fluentci"
  run "release-check" [ [ binary, "--version" ], [ binary, "--help" ] ]

-- | Archive the CLI and generate its checksum.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
package :: { target :: String, version :: String } -> Effect Unit
package args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  let archive = "fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "release-stage"
    [ [ "mkdir", "-p", "target/release-assets/" <> target ]
    , [ "cp", "target/" <> target <> "/release/fluentci", "target/release-assets/" <> target <> "/fluentci" ]
    , [ "env", "COPYFILE_DISABLE=1", "tar", "czf", "target/release-assets/" <> archive, "-C", "target/release-assets/" <> target, "fluentci" ]
    ]
  P.pipeline "release-checksum"
    # P.withWorkdir "target/release-assets"
    # P.withEnv "ARCHIVE" archive
    # P.shell
        """
shasum -a 256 -- "$ARCHIVE" > "$ARCHIVE.sha256"
"""
    # P.exec [ "printf", "%s\n", "Job completed" ]
    # P.stdout
    >>= unwrap
    >>= P.output
    >>= unwrap

-- | Upload the CLI archive and checksum.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
upload :: { target :: String, version :: String } -> Effect Unit
upload args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  let archive = "target/release-assets/fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "release-upload" [ [ "gh", "release", "upload", version, archive, archive <> ".sha256", "--clobber" ] ]

-- | Install Linux release build dependencies.
linuxDependencies :: Effect Unit
linuxDependencies = run "linux-build-dependencies"
  [ [ "sudo", "apt-get", "update" ]
  , [ "sudo", "apt-get", "install", "--yes", "build-essential", "cmake", "pkg-config" ]
  ]

-- | Free disposable runner disk space for BSD virtual machines.
reserveBsdDisk :: Effect Unit
reserveBsdDisk = run "bsd-runner-disk"
  [ [ "sudo", "rm", "-rf", "/usr/local/lib/android", "/usr/share/dotnet", "/usr/local/.ghcup", "/opt/ghc", "/opt/hostedtoolcache/CodeQL" ] ]

-- | Build and package the CLI on a native BSD runner.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
bsdBuild :: { target :: String, version :: String } -> Effect Unit
bsdBuild args = run "bsd-native-build" [ [ "env", "TARGET=" <> args.target, "RELEASE_VERSION=" <> args.version, "sh", ".github/scripts/build-bsd-release.sh" ] ]

-- | Verify copied BSD release artifacts.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
bsdVerify :: { target :: String, version :: String } -> Effect Unit
bsdVerify args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  run "bsd-verify" [ [ "python3", ".github/scripts/verify-bsd-release.py", "dist/bsd/" <> target, version, target ] ]

-- | Upload verified BSD artifacts.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
bsdUpload :: { target :: String, version :: String } -> Effect Unit
bsdUpload args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  let archive = "dist/bsd/" <> target <> "/fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "bsd-upload" [ [ "gh", "release", "upload", version, archive, archive <> ".sha256", "--clobber" ] ]
