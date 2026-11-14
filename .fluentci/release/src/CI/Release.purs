module CI.Release (prepare, build, buildPrepared, check, package, upload, linuxDependencies, reserveBsdDisk, bsdBuild, bsdVerify, bsdUpload, linuxPackageDependencies, linuxPackage, linuxPackageGithub, linuxPackagePublish, smoke) where

import Prelude
import CI.Studio as Studio
import CI.Support (requiredArgument, requiredEnv, run, unwrap)
import CI.LinuxPackages as Packages
import Data.Either (either)
import Data.String.Common (joinWith)
import Data.String.CodeUnits (contains)
import Data.String.Pattern (Pattern(..))
import Effect.Exception (throw)
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
    , [ "escript", ".github/scripts/fluentci_ci", "check-openbsd-msrv" ]
    , [ "escript", ".github/scripts/fluentci_ci", "test" ]
    , [ "escript", ".github/scripts/fluentci_ci", "create-bsd-smoke-fixtures", ".release-smoke" ]
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
  let compiler = case target of
        "x86_64-unknown-linux-musl" -> [ "env", "CC_x86_64_unknown_linux_musl=musl-gcc", "CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc" ]
        "aarch64-unknown-linux-musl" -> [ "env", "CC_aarch64_unknown_linux_musl=musl-gcc", "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc" ]
        _ -> []
  run "release-build"
    [ [ "test", "-s", "webui/dist/index.html" ]
    , compiler <> [ "cargo", "build", "--release", "--locked", "--target", target ]
    ]

-- | Check the built release binary.
-- | @param target Rust target triple for the build or release.
check :: { target :: String } -> Effect Unit
check args = do
  target <- requiredArgument "TARGET" args.target
  let binary = "target/" <> target <> "/release/fluentci"
  when (muslTarget target) $ run "musl-static-linkage"
    [ [ "escript", ".github/scripts/fluentci_ci", "verify-musl-binary", binary, target ] ]
  run "release-check" [ [ binary, "--version" ], [ binary, "--help" ] ]
  when (muslTarget target) do
    workspace <- requiredEnv "GITHUB_WORKSPACE"
    let docker = [ "docker", "run", "--rm", "--network", "none", "--env", "HOME=/tmp", "--env", "XDG_CACHE_HOME=/tmp/cache", "--env", "XDG_DATA_HOME=/tmp/data", "--env", "FLUENTCI_BSD_SMOKE=musl-host-import", "--volume", workspace <> ":/workspace:ro", "--workdir", "/tmp", "alpine:3.22", "/workspace/" <> binary, "--check-update=false", "--database", "/tmp/state.db" ]
    run "musl-alpine-smoke"
      [ docker <> [ "--version" ]
      , docker <> [ "--help" ]
      , docker <> [ "project", "list" ]
      ]
    host <- P.pipeline "musl-alpine-host-import"
      # P.exec (docker <> [ "run", "--wasm", "/workspace/.release-smoke/host_import.wasm", "env_roundtrip" ])
      # P.stdout >>= unwrap
    unless (contains (Pattern "musl-host-import") host) $ throw "Alpine Wasm host import roundtrip failed"
    component <- P.pipeline "musl-alpine-component"
      # P.exec (docker <> [ "run", "--wasm", "/workspace/.fluentci/release/dist/plugin.wasm", "smoke" ])
      # P.stdout >>= unwrap
    unless (contains (Pattern "musl-component-smoke") component) $ throw "Alpine native component smoke failed"

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
  , [ "sudo", "apt-get", "install", "--yes", "build-essential", "cmake", "pkg-config", "musl-tools" ]
  ]

-- | Free disposable runner disk space for BSD virtual machines.
reserveBsdDisk :: Effect Unit
reserveBsdDisk = run "bsd-runner-disk"
  [ [ "sudo", "rm", "-rf", "/usr/local/lib/android", "/usr/share/dotnet", "/usr/local/.ghcup", "/opt/ghc", "/opt/hostedtoolcache/CodeQL" ] ]

-- | Build and package the CLI on a native BSD runner.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
bsdBuild :: { target :: String, version :: String } -> Effect Unit
bsdBuild args = run "bsd-native-build" [ [ "env", "TARGET=" <> args.target, "RELEASE_VERSION=" <> args.version, "escript", ".github/scripts/fluentci_ci", "build-bsd-release" ] ]

-- | Verify copied BSD release artifacts.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
bsdVerify :: { target :: String, version :: String } -> Effect Unit
bsdVerify args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  run "bsd-verify" [ [ "escript", ".github/scripts/fluentci_ci", "verify-bsd-release", "dist/bsd/" <> target, version, target ] ]

-- | Upload verified BSD artifacts.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
bsdUpload :: { target :: String, version :: String } -> Effect Unit
bsdUpload args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  let archive = "dist/bsd/" <> target <> "/fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "bsd-upload" [ [ "gh", "release", "upload", version, archive, archive <> ".sha256", "--clobber" ] ]

-- | Verify a native component can call the host output API without installing tools.
smoke :: Effect Unit
smoke = P.output "musl-component-smoke" >>= unwrap

muslTarget :: String -> Boolean
muslTarget target = target == "x86_64-unknown-linux-musl" || target == "aarch64-unknown-linux-musl"

packageConfig :: { target :: String, version :: String } -> Effect Packages.Config
packageConfig args = do
  target <- requiredArgument "TARGET" args.target
  version <- requiredArgument "RELEASE_VERSION" args.version
  either throw pure (Packages.configurationFor target version)

-- | Install tools for GNU/Linux Debian and RPM package creation.
-- | @param target GNU/Linux Rust target triple to package.
linuxPackageDependencies :: { target :: String } -> Effect Unit
linuxPackageDependencies args = do
  unless (args.target == "x86_64-unknown-linux-gnu" || args.target == "aarch64-unknown-linux-gnu") $ throw "Packages support GNU Linux targets only"
  run "linux-package-tools"
    [ [ "sudo", "apt-get", "update" ]
    , [ "sudo", "apt-get", "install", "--yes", "dpkg-dev", "rpm" ] ]

-- | Generate FluentCI Debian/RPM metadata and build packages with checksums.
-- | @param target GNU/Linux Rust target triple to package.
-- | @param version Semantic release tag to package.
linuxPackage :: { target :: String, version :: String } -> Effect Unit
linuxPackage args = packageConfig args >>= Packages.packageWith

-- | Upload the generated Debian/RPM packages and checksums to GitHub.
-- | @param target GNU/Linux Rust target triple to package.
-- | @param version Semantic release tag to publish.
linuxPackageGithub :: { target :: String, version :: String } -> Effect Unit
linuxPackageGithub args = do
  config <- packageConfig args
  _ <- requiredEnv "GH_TOKEN"
  run "linux-package-github-upload"
    [ [ "gh", "release", "upload", config.tag ] <> Packages.files config <> [ "--clobber" ] ]

-- | Upload packages through the pinned published Gemfury component.
-- | @param target GNU/Linux Rust target triple to publish.
-- | @param version Semantic release tag to publish. FURY credentials remain in the host environment.
linuxPackagePublish :: { target :: String, version :: String } -> Effect Unit
linuxPackagePublish args = do
  config <- packageConfig args
  run "published-gemfury-upload"
    [ [ "fluentci", "--check-update=false", "run", "--frozen-lockfile", "gemfury", "upload", "--files", joinWith "," [ config.deb, config.rpm ] ] ]
