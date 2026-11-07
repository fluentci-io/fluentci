module CI.Desktop (build, clean, sign, package, upload) where

import Prelude
import CI.Support (requiredEnv, run, runIn, unwrap)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

macosTarget :: Effect String
macosTarget = do
  target <- requiredEnv "TARGET"
  case target of
    "aarch64-apple-darwin" -> pure target
    "x86_64-apple-darwin" -> pure target
    _ -> throw "Desktop releases require TARGET=aarch64-apple-darwin or x86_64-apple-darwin"

releaseVersion :: Effect String
releaseVersion = do
  version <- requiredEnv "RELEASE_VERSION"
  run "desktop-release-inputs"
    [ [ "sh", "-eu", "-c", """
case "$RELEASE_VERSION" in
  ''|*[!A-Za-z0-9._+-]*) echo 'Unsupported desktop release tag' >&2; exit 1 ;;
esac
""" ] ]
  pure version

appPath :: String -> String
appPath target = "desktop/src-tauri/target/" <> target <> "/release/bundle/macos/FluentCI Studio.app"

assetPath :: String -> String -> String
assetPath version target = "desktop/release-assets/FluentCI-Studio_" <> version <> "_" <> target

-- The Tauri wrapper uses release mode and --locked; its hook builds Studio first.
build :: Effect Unit
build = do
  target <- macosTarget
  runIn "desktop-build" "desktop"
    [ [ "bun", "install", "--frozen-lockfile", "--ignore-scripts" ]
    , [ "bun", "run", "build", "--target", target, "--bundles", "app", "--no-sign" ]
    ]

-- Discard workspace build products after bundling, keeping dependency caches and
-- the finished .app. This is intentionally restricted to disposable CI runners.
clean :: Effect Unit
clean = do
  target <- macosTarget
  P.pipeline "desktop-clean"
    # P.withEnv "APP" (appPath target)
    # P.withEnv "TARGET" target
    # P.shell """
set -eu
if [ "${GITHUB_ACTIONS:-}" != true ]; then
  printf '%s\n' 'Skipping desktop build cleanup outside GitHub Actions'
  exit 0
fi
test -s "$APP/Contents/MacOS/fluentci-desktop"
df -h .
cargo clean --release --locked --manifest-path desktop/src-tauri/Cargo.toml --target "$TARGET" --package fluentci --package fluentci-desktop
rm -rf desktop/src-tauri/target/debug "desktop/src-tauri/target/$TARGET/debug"
find desktop/src-tauri/target -type d -name bundle -prune -o -type d -name incremental -prune -exec rm -rf {} +
# Frontend dependencies are not used after the app embeds its Studio assets.
# Bun's global download cache and reusable Cargo dependency artifacts remain.
rm -rf node_modules webui/node_modules desktop/node_modules apps/api/node_modules apps/landing/node_modules apps/modules/node_modules docs/node_modules
test -s "$APP/Contents/MacOS/fluentci-desktop"
df -h .
"""
    # P.stdout >>= unwrap >>= P.output >>= unwrap

-- Match Rocksky Desktop: an ad hoc signature, with no Apple identity required.
sign :: Effect Unit
sign = do
  target <- macosTarget
  let app = appPath target
  run "desktop-sign"
    [ [ "test", "-d", app ]
    , [ "codesign", "--force", "--deep", "--sign", "-", app ]
    , [ "codesign", "--verify", "--deep", "--strict", "--verbose=2", app ]
    ]

-- Signing and verification must succeed before producing distributable archives.
package :: Effect Unit
package = do
  target <- macosTarget
  version <- releaseVersion
  sign
  P.pipeline "desktop-package"
    # P.withEnv "APP" (appPath target)
    # P.withEnv "ASSET" (assetPath version target)
    # P.shell """
set -eu
mkdir -p desktop/release-assets
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/FluentCI Studio"
ditto "$APP" "$stage/FluentCI Studio/FluentCI Studio.app"
ln -s /Applications "$stage/FluentCI Studio/Applications"
# Allocated blocks can undercount sparse/compressed app binaries. Size the image
# from both logical file bytes and allocated blocks, then reserve filesystem room.
logical_kib=$(find "$stage/FluentCI Studio" -type f -exec stat -f '%z' {} + | awk '{bytes += $1} END {printf "%.0f\n", int((bytes + 1023) / 1024)}')
allocated_kib=$(du -sk "$stage/FluentCI Studio" | awk '{print $1}')
if [ "$allocated_kib" -gt "$logical_kib" ]; then logical_kib=$allocated_kib; fi
image_mib=$(( (logical_kib + logical_kib / 2 + 131072 + 1023) / 1024 ))
printf 'Creating %s MiB HFS+ image\n' "$image_mib"
df -h . "$stage"
hdiutil create -size "${image_mib}m" -fs HFS+ -volname 'FluentCI Studio' -srcfolder "$stage/FluentCI Studio" -ov -format UDZO "$ASSET.dmg"
hdiutil verify "$ASSET.dmg"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ASSET.app.zip"
cd desktop/release-assets
for file in "${ASSET##*/}.dmg" "${ASSET##*/}.app.zip"; do
  shasum -a 256 -- "$file" > "$file.sha256"
done
"""
    # P.exec [ "printf", "%s\n", "Desktop package completed" ]
    # P.stdout >>= unwrap >>= P.output >>= unwrap

upload :: Effect Unit
upload = do
  target <- macosTarget
  version <- releaseVersion
  let asset = assetPath version target
  run "desktop-upload"
    [ [ "gh", "release", "upload", version, asset <> ".dmg", asset <> ".dmg.sha256", asset <> ".app.zip", asset <> ".app.zip.sha256", "--clobber" ] ]
