#!/bin/bash
set -euo pipefail

# The version the app carries, which is the version of everything else.
#
# Spool has one number: the npm package, the git tag, the daemon's /api/health,
# the spool package inside this bundle, and CFBundleShortVersionString. Changesets
# picks it, in ../package.json, and nothing here ever writes one. That is why
# desktop/package.json says 0.0.0 and the build passes the real number in.
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

# A Spool Beta build (spool#282) is the one exception: the beta workflow stamps
# package.json with the next patch and `-beta.N` before it builds, and never
# commits it. No release ever carries a suffix.
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]]; then
	echo "package.json says version \"$VERSION\", which is not X.Y.Z or a beta's X.Y.Z-beta.N." >&2
	echo "The app compares three plain numbers and refuses anything else." >&2
	exit 1
fi

EXPECTED="${1:-}"

if [ -z "$EXPECTED" ]; then
	echo "$VERSION"
	exit 0
fi

# A release is never a beta: a suffix here would bake Spool Beta's state, port
# and experiments into the package npm users install.
if [[ "$VERSION" == *-beta.* ]]; then
	echo "package.json says $VERSION, a Spool Beta version, which is never released." >&2
	exit 1
fi

if [ "${EXPECTED#v}" != "$VERSION" ]; then
	echo "The tag says ${EXPECTED#v}, package.json says $VERSION." >&2
	echo "The tag is cut from package.json by the release PR, so these disagreeing" >&2
	echo "means this checkout is not the tag it claims to be." >&2
	exit 1
fi

echo "$VERSION"
