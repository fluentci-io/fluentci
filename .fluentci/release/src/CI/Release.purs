module CI.Release (build, package, upload) where

import Prelude
import CI.Studio as Studio
import CI.Support (requiredEnv, run, unwrap)
import Effect (Effect)
import FluentCI.Plugin as P

build :: Effect Unit
build = do
  target <- requiredEnv "TARGET"
  Studio.build
  run "release-build" [ [ "cargo", "build", "--release", "--locked", "--target", target ] ]

package :: Effect Unit
package = do
  target <- requiredEnv "TARGET"
  version <- requiredEnv "RELEASE_VERSION"
  let archive = "fluentci_" <> version <> "_" <> target <> ".tar.gz"
  run "release-stage"
    [ [ "mkdir", "-p", "target/release-assets/" <> target ]
    , [ "cp", "target/" <> target <> "/release/fluentci", "target/release-assets/" <> target <> "/fluentci" ]
    , [ "tar", "czf", "target/release-assets/" <> archive, "-C", "target/release-assets/" <> target, "fluentci" ]
    ]
  -- The fixed shell fragment expands environment values only inside quotes.
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
  run "release-upload" [ [ "gh", "release", "upload", version, archive, archive <> ".sha256" ] ]
