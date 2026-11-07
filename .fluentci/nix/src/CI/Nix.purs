module CI.Nix (check, metadata, flakehub, flakestry) where

import Prelude
import CI.Support (requiredArgument, requiredEnv, run, unwrap)
import Effect (Effect)
import FluentCI.Plugin as P

-- | Check the Nix flake without changing its lockfile.
check :: Effect Unit
check = run "nix-check" [ [ "nix", "flake", "check", "--no-write-lock-file" ] ]

-- | Inspect flake metadata and outputs for all systems.
metadata :: Effect Unit
metadata = run "nix-metadata"
  [ [ "nix", "flake", "metadata", "--json", "--no-write-lock-file" ]
  , [ "nix", "flake", "show", "--json", "--all-systems", "--no-write-lock-file" ]
  ]

-- | Publish the selected release tag to FlakeHub using GitHub OIDC.
-- | @param version Release tag, for example v0.17.2.
flakehub :: { version :: String } -> Effect Unit
flakehub args = do
  version <- requiredArgument "RELEASE_VERSION" args.version
  -- The publisher's CLI reads this explicit variable, not GITHUB_TOKEN.
  -- Keep credentials in the inherited environment, never in exec arguments.
  _ <- requiredEnv "FLAKEHUB_PUSH_GITHUB_TOKEN"
  _ <- requiredEnv "ACTIONS_ID_TOKEN_REQUEST_TOKEN"
  _ <- requiredEnv "ACTIONS_ID_TOKEN_REQUEST_URL"
  run "flakehub-publish"
    [ [ "flakehub-push", "--visibility", "public", "--name", "fluentci-io/fluentci", "--tag", version ] ]

-- | Publish the selected release and revision to Flakestry using GitHub OIDC.
-- | @param version Release tag, for example v0.17.2.
-- | @param ref Git revision to publish.
flakestry :: { version :: String, ref :: String } -> Effect Unit
flakestry args = do
  _ <- requiredArgument "VERSION" args.version
  _ <- requiredArgument "REF" args.ref
  _ <- requiredEnv "GH_TOKEN"
  _ <- requiredEnv "ACTIONS_ID_TOKEN_REQUEST_TOKEN"
  _ <- requiredEnv "ACTIONS_ID_TOKEN_REQUEST_URL"
  P.pipeline "flakestry-publish"
    # P.withEnv "VERSION" args.version
    # P.withEnv "REF" args.ref
    # P.shell
        """
set -eu
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
nix flake metadata --json --no-write-lock-file > "$work/metadata.json" 2> "$work/metadata.err"
nix flake show --json --all-systems --no-write-lock-file > "$work/outputs.json" 2> "$work/outputs.err"
curl --fail-with-body --silent --show-error \
  -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://flakestry.dev" > "$work/token.json"
oidc=$(jq -er '.value' "$work/token.json")
jo metadata=:"$work/metadata.json" metadata_errors=@"$work/metadata.err" \
  outputs=:"$work/outputs.json" outputs_errors=@"$work/outputs.err" \
  readme=README.md version="$VERSION" ref="$REF" > "$work/publish.json"
curl --fail-with-body --silent --show-error \
  -H 'Content-Type: application/json' -H "Github-Token: $GH_TOKEN" \
  -H "Authorization: Bearer $oidc" --data-binary @"$work/publish.json" \
  https://flakestry.dev/api/publish
"""
    # P.exec [ "printf", "%s\n", "Job completed" ]
    # P.stdout
    >>= unwrap
    >>= P.output
    >>= unwrap
