#!/bin/bash
set -euo pipefail

# Fetches the one thing the app ships that is not its own code: the published
# spool package. It lands in build/cli, which electron-builder copies into
# Contents/Resources/cli.
#
#   build/cli/spool/node_modules/spool.page/dist/cli.js
#   build/cli/RUNTIME.txt
#
# The install sits one level down rather than at the top of what is copied,
# because electron-builder refuses to copy a directory called node_modules that
# sits at the root of an extraResources source. One nested folder is a cheaper
# answer than a patched packer.
#
# The point of the app is that nobody installs Node and nobody runs npm, so the
# install happens here, once, on the build machine. There is no Node in the
# bundle to fetch: Electron's own executable is the Node the daemon runs under,
# which is what ELECTRON_RUN_AS_NODE means, and Electron 43 carries Node 24.
#
# The spool package comes from the registry by version. The dmg job runs after
# npm publish on the same tag, but a newly accepted version can take minutes to
# become readable. A registry-based release waits and never falls back to the
# checkout. A local build of an unreleased version does, which is also what you
# want when you are changing the CLI and the app together.
#
#   VERSION   the spool version to bundle (default: scripts/version.sh)
#   OUT       where it is staged (default: build/cli)
#   SPOOL_RELEASE_BUILD  set to 1 by the release workflow

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
# Named CLI_OUT, not OUT: package.sh is invoked with OUT in its environment
# (the dist directory), and this script runs beneath it. Sharing the name made
# the cli stage into the dist directory and `rm -rf` it on the release runner,
# while every un-exported local run passed.
CLI_OUT="${CLI_OUT:-$ROOT/build/cli}"
VERSION="${VERSION:-$("$ROOT/scripts/version.sh")}"
RELEASE_BUILD="${SPOOL_RELEASE_BUILD:-0}"

if [ "$RELEASE_BUILD" = 1 ]; then
	REGISTRY_ATTEMPTS=30
	REGISTRY_RETRY_SECONDS=10
	# npm otherwise retries a failed fetch itself, outside the loop this script
	# bounds. A release gets one five-second fetch per visible attempt.
	VIEW_OPTIONS=(--fetch-retries=0 --fetch-timeout=5000)
else
	REGISTRY_ATTEMPTS=5
	REGISTRY_RETRY_SECONDS=5
	VIEW_OPTIONS=()
fi

STAMP="spool.page $VERSION"
if [ -z "${SPOOL_TARBALL:-}" ] && [ -f "$CLI_OUT/RUNTIME.txt" ] && grep -qxF "$STAMP" "$CLI_OUT/RUNTIME.txt"; then
	echo "cli already staged: $STAMP"
	exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

published() {
	local attempt=1
	local found
	while [ "$attempt" -le "$REGISTRY_ATTEMPTS" ]; do
		found="$(npm view "spool.page@$VERSION" version "${VIEW_OPTIONS[@]}" 2>/dev/null || true)"
		if [ "$found" = "$VERSION" ]; then return 0; fi
		if [ "$attempt" -lt "$REGISTRY_ATTEMPTS" ]; then
			echo "waiting for npm to serve spool.page@$VERSION ($attempt/$REGISTRY_ATTEMPTS)"
			sleep "$REGISTRY_RETRY_SECONDS"
		fi
		attempt=$((attempt + 1))
	done
	return 1
}

SPEC="spool.page@$VERSION"
if [ -n "${SPOOL_TARBALL:-}" ]; then
	SPEC="$SPOOL_TARBALL"
	echo "using $SPEC"
elif published; then
	echo "installing $SPEC from the registry"
elif [ "$RELEASE_BUILD" = 1 ]; then
	echo "npm did not serve the exact version spool.page@$VERSION after $REGISTRY_ATTEMPTS checks; refusing to build a release from the checkout." >&2
	exit 1
else
	echo "npm has no spool.page@$VERSION yet, packing this checkout instead"
	# What a local build of an unreleased version wants anyway: the app and the
	# CLI change together, and testing the app against last week's published
	# daemon would test the wrong thing. This path needs the checkout's dev
	# dependencies installed, because pnpm pack runs the build.
	(cd "$REPO" && pnpm pack --pack-destination "$WORK" > /dev/null)
	SPEC="$(ls "$WORK"/spool.page-*.tgz | head -n 1)"
	echo "using $SPEC"
fi

rm -rf "$CLI_OUT"
mkdir -p "$CLI_OUT/spool"

# A private package.json first, or npm walks up out of the staging directory and
# installs into whatever it finds. --omit=dev is npm's default for a dependency,
# and is spelled out so nobody has to remember that.
cat > "$CLI_OUT/spool/package.json" <<JSON
{
	"name": "spool-bundled-cli",
	"private": true,
	"version": "0.0.0"
}
JSON

npm install --prefix "$CLI_OUT/spool" --omit=dev --no-audit --no-fund --loglevel=error "$SPEC"

CLI="$CLI_OUT/spool/node_modules/spool.page/dist/cli.js"
if [ ! -f "$CLI" ]; then
	echo "the install produced no $CLI." >&2
	exit 1
fi

# The bundled daemon says its own version, which is the check that the npm
# artifact, the plist and the tag are one number rather than three.
INSTALLED="$(node "$CLI" --version)"
if [ "$INSTALLED" != "$VERSION" ]; then
	echo "the bundled cli reports $INSTALLED, not $VERSION." >&2
	exit 1
fi

{
	echo "$STAMP"
	echo "spool source $SPEC"
	echo "staged $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$CLI_OUT/RUNTIME.txt"

echo "staged $CLI_OUT"
cat "$CLI_OUT/RUNTIME.txt"
