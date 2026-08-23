#!/bin/bash
set -euo pipefail

# Builds Spool.app. electron-builder assembles the bundle; this compiles what
# goes in it, stages the published spool package beside it, and passes the one
# version number through.
#
# Ad-hoc signed by default, which is enough to run on this machine and is not
# optional: Apple silicon refuses an unsigned bundle outright. The release
# pipeline passes a real Developer ID identity in SIGN_IDENTITY and then
# scripts/package.sh notarizes what comes out.
#
#   SIGN_IDENTITY  Developer ID Application identity, or - for ad hoc
#   VERSION        the version to stamp (default: scripts/version.sh)
#
# The app lands at release/mac-arm64/Spool.app.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${VERSION:-$("$ROOT/scripts/version.sh")}"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"

# Stop any running copy so the bundle can be replaced cleanly, and so the daemon
# it owns is stopped by its own supervisor rather than orphaned by an rm.
if pgrep -x Spool > /dev/null 2>&1; then
	osascript -e 'quit app id "page.spool.mac"' > /dev/null 2>&1 || pkill -x Spool || true
	sleep 1
fi

rm -rf dist release
./node_modules/.bin/tsc
VERSION="$VERSION" "$ROOT/scripts/bundle-cli.sh"

BUILDER=(./node_modules/.bin/electron-builder --mac --publish never "-c.extraMetadata.version=$VERSION")
if [ "$SIGN_IDENTITY" != "-" ]; then
	# electron-builder takes the certificate's name without its type prefix and
	# picks the Developer ID Application certificate by that name itself; handed
	# the full identity string it refuses to build. codesign, below, wants the
	# full string, so SIGN_IDENTITY keeps it and only this argument is trimmed.
	BUILDER+=("-c.mac.identity=${SIGN_IDENTITY#Developer ID Application: }")
else
	# electron-builder has no ad-hoc mode and would otherwise hunt the keychain for
	# any Developer ID it can find, which on a developer's machine means a local
	# build signed with a certificate nobody asked it to use. Signing is done below
	# instead.
	export CSC_IDENTITY_AUTO_DISCOVERY=false
fi
"${BUILDER[@]}"

APP="$ROOT/release/mac-arm64/Spool.app"
[ -d "$APP" ] || { echo "electron-builder produced no $APP." >&2; exit 1; }

STAMPED="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")"
if [ "$STAMPED" != "$VERSION" ]; then
	echo "the bundle says $STAMPED, not $VERSION." >&2
	exit 1
fi

# electron-builder skips signing entirely when there is no identity, and flipping
# the runAsNode fuse breaks the ad-hoc signature the Electron download arrived
# with, so what it leaves behind will not launch on Apple silicon. Sign it here
# instead, ad hoc and with the same entitlements the release build gets, so a
# local run exercises the hardened runtime rather than a softer thing. --deep is
# fine for a signature that only has to satisfy this machine; the release path
# signs inside out, which is @electron/osx-sign's job.
if [ "$SIGN_IDENTITY" = "-" ]; then
	codesign --force --deep --options runtime --timestamp=none \
		--entitlements "$ROOT/build/entitlements.mac.plist" --sign - "$APP"
fi

codesign --verify --deep --strict --verbose=2 "$APP"

echo "built: $APP ($VERSION)"
