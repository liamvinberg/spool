#!/bin/bash
set -euo pipefail

# Fetches the two things the app ships that are not Swift: a Node runtime and the
# published spool package. Both land in a staging directory that scripts/build.sh
# copies into Contents/Resources/runtime.
#
#   runtime/bin/node
#   runtime/cli/node_modules/spool.page/dist/cli.js
#   runtime/RUNTIME.txt
#
# The point of the app is that nobody installs Node and nobody runs npm, so the
# install happens here, once, on the build machine.
#
# Node is pinned to major 22, which is the floor in the repo's package.json
# ("engines": { "node": ">=22" }). Pinning the major and taking the newest
# release inside it is the deliberate middle: a hard-pinned patch goes stale and
# ships a Node with a known CVE in it, and an unpinned major would one day ship a
# Node the package does not support. SPOOL_NODE_VERSION overrides the resolution
# when a specific build has to be reproduced. Whatever is chosen is recorded in
# RUNTIME.txt, so "which Node is in there" has an answer after the fact.
#
# The archive is checked against nodejs.org's own SHASUMS256.txt, fetched over
# TLS from the same host. That catches a truncated download and a file that is
# not the one the release lists. It is not a signature check and is not claimed
# to be one: the trust here is in the TLS connection to nodejs.org.
#
# The spool package comes from the registry by version. The DMG job runs after
# npm publish on the same tag, so the version is always there by then. A local
# build of an unreleased version falls back to packing this checkout, which is
# also what you want when you are changing the CLI and the app together.
#
#   VERSION   the spool version to bundle (default: scripts/version.sh)
#   OUT       where the runtime is staged (default: .build/runtime)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
OUT="${OUT:-$ROOT/.build/runtime}"
VERSION="${VERSION:-$("$ROOT/scripts/version.sh")}"
NODE_MAJOR=22

case "$(uname -m)" in
	arm64) NODE_ARCH="darwin-arm64" ;;
	x86_64) NODE_ARCH="darwin-x64" ;;
	*)
		echo "no Node build for $(uname -m)." >&2
		exit 1
		;;
esac

if [ -n "${SPOOL_NODE_VERSION:-}" ]; then
	NODE_VERSION="${SPOOL_NODE_VERSION#v}"
else
	NODE_VERSION="$(curl -fsSL https://nodejs.org/dist/index.json | node -e '
		const major = Number(process.argv[1]);
		let input = "";
		process.stdin.on("data", (chunk) => { input += chunk; });
		process.stdin.on("end", () => {
			const releases = JSON.parse(input)
				.map((release) => release.version.replace(/^v/, ""))
				.filter((version) => Number(version.split(".")[0]) === major);
			if (releases.length === 0) throw new Error("nodejs.org lists no " + major + ".x release");
			// index.json is newest first, and every entry inside one major is
			// ordered with it, so the first match is the newest patch.
			process.stdout.write(releases[0]);
		});
	' "$NODE_MAJOR")"
fi

# Already staged and already the right two versions: skip the download and the
# install, so an edit-build-run loop does not refetch 150MB every time.
STAMP="node v$NODE_VERSION $NODE_ARCH / spool.page $VERSION"
if [ -f "$OUT/RUNTIME.txt" ] && grep -qxF "$STAMP" "$OUT/RUNTIME.txt"; then
	echo "runtime already staged: $STAMP"
	exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "fetching node v$NODE_VERSION ($NODE_ARCH)"
ARCHIVE="node-v$NODE_VERSION-$NODE_ARCH.tar.gz"
curl -fsSL -o "$WORK/$ARCHIVE" "https://nodejs.org/dist/v$NODE_VERSION/$ARCHIVE"
curl -fsSL -o "$WORK/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"

(
	cd "$WORK"
	# grep first, so a checksum file that does not mention this archive fails here
	# rather than being reported as a passing check of nothing.
	grep " $ARCHIVE\$" SHASUMS256.txt > expected.txt
	shasum -a 256 -c expected.txt
)
NODE_SHA="$(shasum -a 256 "$WORK/$ARCHIVE" | cut -d " " -f 1)"

rm -rf "$OUT"
mkdir -p "$OUT/bin" "$OUT/cli"

# Only the binary. The rest of the tarball is npm, headers and man pages, and the
# app runs one command with one script: none of it is reachable from here.
tar -xzf "$WORK/$ARCHIVE" -C "$WORK" "node-v$NODE_VERSION-$NODE_ARCH/bin/node"
mv "$WORK/node-v$NODE_VERSION-$NODE_ARCH/bin/node" "$OUT/bin/node"
chmod 755 "$OUT/bin/node"

published() {
	# The DMG job runs minutes after npm publish, and the registry has been
	# known to take a moment to serve a version it has just accepted. A handful
	# of tries rather than one, so a release does not fall back to packing a
	# checkout over a few seconds of registry lag.
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

# A private package.json first, or npm walks up out of the staging directory and
# installs into whatever it finds. --omit=dev is npm's default for a dependency,
# and is spelled out so nobody has to remember that.
cat > "$OUT/cli/package.json" <<JSON
{
	"name": "spool-bundled-cli",
	"private": true,
	"version": "0.0.0"
}
JSON

npm install --prefix "$OUT/cli" --omit=dev --no-audit --no-fund --loglevel=error "$SPEC"

CLI="$OUT/cli/node_modules/spool.page/dist/cli.js"
if [ ! -f "$CLI" ]; then
	echo "the install produced no $CLI." >&2
	exit 1
fi

# The bundled daemon says its own version, which is the check that the npm
# artifact, the plist and the tag are one number rather than three.
INSTALLED="$("$OUT/bin/node" "$CLI" --version)"
if [ "$INSTALLED" != "$VERSION" ]; then
	echo "the bundled cli reports $INSTALLED, not $VERSION." >&2
	exit 1
fi

{
	echo "$STAMP"
	echo "node sha256 $NODE_SHA"
	echo "node source https://nodejs.org/dist/v$NODE_VERSION/$ARCHIVE"
	echo "spool source $SPEC"
	echo "staged $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT/RUNTIME.txt"

echo "staged $OUT"
cat "$OUT/RUNTIME.txt"
