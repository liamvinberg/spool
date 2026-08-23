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
# npm publish on the same tag, so the version is always there by then. A local
# build of an unreleased version falls back to packing this checkout, which is
# also what you want when you are changing the CLI and the app together.
#
#   VERSION   the spool version to bundle (default: scripts/version.sh)
#   OUT       where it is staged (default: build/cli)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
# Named CLI_OUT, not OUT: package.sh is invoked with OUT in its environment
# (the dist directory), and this script runs beneath it. Sharing the name made
# the cli stage into the dist directory and `rm -rf` it on the release runner,
# while every un-exported local run passed.
CLI_OUT="${CLI_OUT:-$ROOT/build/cli}"
VERSION="${VERSION:-$("$ROOT/scripts/version.sh")}"

STAMP="spool.page $VERSION"
if [ -f "$CLI_OUT/RUNTIME.txt" ] && grep -qxF "$STAMP" "$CLI_OUT/RUNTIME.txt"; then
	echo "cli already staged: $STAMP"
	exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

published() {
	# The dmg job runs minutes after npm publish, and the registry has been known
	# to take a moment to serve a version it has just accepted. A handful of tries
	# rather than one, so a release does not fall back to packing a checkout over
	# a few seconds of registry lag.
	local attempt
	for attempt in 1 2 3 4 5; do
		if npm view "spool.page@$VERSION" version > /dev/null 2>&1; then return 0; fi
		[ "$attempt" = 5 ] && return 1
		sleep 5
	done
}

SPEC="spool.page@$VERSION"
if [ -n "${SPOOL_TARBALL:-}" ]; then
	SPEC="$SPOOL_TARBALL"
	echo "using $SPEC"
elif published; then
	echo "installing $SPEC from the registry"
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
