#!/bin/bash
set -euo pipefail

# The version the app carries, which is the version of everything else.
#
# Spool has one number: the npm package, the git tag, the daemon's /api/health,
# the spool package inside this bundle, and CFBundleShortVersionString. Changesets
# picks it, in ../package.json, and nothing here ever writes one. That is why this
# is not the model repo's version.sh, which bumped a plist and cut a tag: doing
# that here would be a second place a version could be decided from, and the two
# would disagree on the first release nobody thought about it.
#
#   ./scripts/version.sh          prints the version the next build will carry
#   ./scripts/version.sh v0.8.0   checks a tag against it, and fails if it differs
#
# The release workflow calls the second form before it builds anything, so a DMG
# can never be stamped with a number the tag does not agree with. An installed
# copy compares its own number against the newest release tag, and that check is
# only worth anything if the two came from the same place.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"

VERSION="$(node -p "require('$REPO/package.json').version")"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "package.json says version \"$VERSION\", which is not X.Y.Z." >&2
	echo "The app compares three plain numbers and refuses anything else." >&2
	exit 1
fi

EXPECTED="${1:-}"

if [ -z "$EXPECTED" ]; then
	echo "$VERSION"
	exit 0
fi

if [ "${EXPECTED#v}" != "$VERSION" ]; then
	echo "The tag says ${EXPECTED#v}, package.json says $VERSION." >&2
	echo "The tag is cut from package.json by the release PR, so these disagreeing" >&2
	echo "means this checkout is not the tag it claims to be." >&2
	exit 1
fi

echo "$VERSION"
