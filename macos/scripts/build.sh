#!/bin/bash
set -euo pipefail

# Builds Spool.app. SwiftPM compiles the binary, this assembles the bundle around
# it, because SwiftPM has no notion of a .app and most of this app is bundle: the
# Info.plist that keeps it out of the Dock, and a Node runtime with the spool
# package under Resources.
#
# Ad-hoc signed by default, which is enough to run on this machine; the release
# pipeline passes a real Developer ID identity in SIGN_IDENTITY and then
# scripts/package.sh notarizes what comes out.
#
#   DEST           where the .app lands (default ~/Applications)
#   SIGN_IDENTITY  Developer ID Application identity, or - for ad hoc
#   VERSION        the version to stamp (default: scripts/version.sh)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${DEST:-$HOME/Applications}"
APP="$DEST/Spool.app"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"
VERSION="${VERSION:-$("$ROOT/scripts/version.sh")}"
ENTITLEMENTS="$ROOT/Resources/Spool.entitlements"

swift build -c release --package-path "$ROOT" --product Spool
BIN="$(swift build -c release --package-path "$ROOT" --show-bin-path)/Spool"

# The Node runtime and the published spool package. Cached in .build between
# runs; see the script for what it pins and why.
VERSION="$VERSION" OUT="$ROOT/.build/runtime" "$ROOT/scripts/bundle-runtime.sh"

# Stop any running copy so the bundle can be replaced cleanly, and so the daemon
# it owns is stopped by its own supervisor rather than orphaned by an rm.
if pgrep -x Spool > /dev/null 2>&1; then
	osascript -e 'quit app id "page.spool.mac"' > /dev/null 2>&1 || pkill -x Spool || true
	sleep 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/Resources/Info.plist" "$APP/Contents/Info.plist"
cp "$BIN" "$APP/Contents/MacOS/Spool"
# The Finder and DMG icon. Committed rather than drawn here, so a build never
# depends on being able to render one. scripts/icon.sh regenerates it.
cp "$ROOT/Resources/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp -R "$ROOT/.build/runtime" "$APP/Contents/Resources/runtime"

# The version is stamped into the copy, never into the committed plist: spool has
# one version number and changesets owns it. See scripts/version.sh.
for KEY in CFBundleShortVersionString CFBundleVersion; do
	/usr/libexec/PlistBuddy -c "Set :$KEY $VERSION" "$APP/Contents/Info.plist"
done
plutil -lint "$APP/Contents/Info.plist" > /dev/null

# A real identity signs with a secure timestamp, because notarization refuses a
# bundle without one. Ad-hoc signing cannot have one at all.
TIMESTAMP=(--timestamp)
if [ "$SIGN_IDENTITY" = "-" ]; then
	TIMESTAMP=(--timestamp=none)
fi

sign() {
	codesign --force --options runtime "${TIMESTAMP[@]}" \
		--entitlements "$ENTITLEMENTS" --sign "$SIGN_IDENTITY" "$1"
}

# Inside out. Everything executable under Resources is code as far as macOS is
# concerned: the node binary, the .node addons npm built, the dylibs beside them.
# An unsigned one of those is a notarization rejection at best and a bundle that
# refuses to launch at worst, and signing the app first would only have its seal
# broken by signing something inside it afterwards.
#
# The entitlements go on every one of them because the hardened runtime is
# per-binary: node is the process that needs JIT, and it is not the one whose
# name is on the bundle. See Resources/Spool.entitlements.
while IFS= read -r item; do
	sign "$item"
done < <(
	find "$APP/Contents/Resources/runtime" -type f \
		\( -perm -100 -o -name "*.node" -o -name "*.dylib" -o -name "*.so" \) \
		-exec sh -c 'file -b "$1" | grep -q "Mach-O" && printf "%s\n" "$1"' _ {} \;
)

sign "$APP"
codesign --verify --strict --verbose=2 "$APP"

echo "built: $APP ($VERSION)"
