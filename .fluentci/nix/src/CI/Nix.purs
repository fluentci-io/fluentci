module CI.Nix (check, metadata, flakehub, flakestry) where

import Prelude
import CI.Support (requiredEnv, run, unwrap)
import Effect (Effect)
import FluentCI.Plugin as P

check :: Effect Unit
check = run "nix-check" [ [ "nix", "flake", "check", "--no-write-lock-file" ] ]

metadata :: Effect Unit
metadata = run "nix-metadata"
  [ [ "nix", "flake", "metadata", "--json", "--no-write-lock-file" ]
  , [ "nix", "flake", "show", "--json", "--all-systems", "--no-write-lock-file" ]
  ]

flakehub :: Effect Unit
flakehub = do
  version <- requiredEnv "RELEASE_VERSION"
  run "flakehub-publish"
    [ [ "flakehub-push", "--visibility", "public", "--name", "fluentci-io/fluentci", "--tag", version ] ]

flakestry :: Effect Unit
flakestry = do
  _ <- requiredEnv "VERSION"
  _ <- requiredEnv "REF"
  _ <- requiredEnv "GH_TOKEN"
  _ <- requiredEnv "ACTIONS_ID_TOKEN_REQUEST_TOKEN"
  _ <- requiredEnv "ACTIONS_ID_TOKEN_REQUEST_URL"
  P.pipeline "flakestry-publish"
    # P.shell """
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
    # P.stdout >>= unwrap >>= P.output >>= unwrap
