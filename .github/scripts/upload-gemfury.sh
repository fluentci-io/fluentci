#!/usr/bin/env bash
set -euo pipefail
source .github/scripts/linux-package-env.sh
: "${FURY_TOKEN:?FURY_TOKEN is required}"
: "${FURY_USER:?FURY_USER is required}"
: "${FURY_ACCOUNT:?FURY_ACCOUNT is required}"
if [[ ! "$FURY_USER" =~ ^[A-Za-z0-9_.@+-]+$ ]]; then
    echo 'Invalid Gemfury authentication user' >&2
    exit 1
fi
if [[ ! "$FURY_ACCOUNT" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo 'Invalid Gemfury account name' >&2
    exit 1
fi
# Validate both files before uploading either package.
for file in "$deb_file" "$rpm_file"; do
    test -s "$file" || { echo "Missing package: $file" >&2; exit 1; }
done
for file in "$deb_file" "$rpm_file"; do
    echo "Uploading ${file##*/} to Gemfury account $FURY_ACCOUNT"
    # curl >= 8.3 expands the token itself, keeping it out of argv and job plans.
    curl --fail-with-body --silent --show-error \
        --variable '%FURY_USER' --variable '%FURY_TOKEN' \
        --expand-user '{{FURY_USER}}:{{FURY_TOKEN}}' \
        --form "package=@\"$file\"" "https://push.fury.io/$FURY_ACCOUNT/"
done
