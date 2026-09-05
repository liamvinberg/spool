#!/bin/bash
set -euo pipefail

# Builds the thing people download: Spool.app signed with a real Developer ID,
# stapled, inside a signed and stapled dmg. Stapling both is what makes the
# download open on a machine that has never seen it, offline, without the
# right-click-Open dance.
#
# With no notary credentials in the environment it still builds and signs a dmg
# and says it did not notarize it, so the packaging can be checked without Apple
# in the loop. `SIGN_IDENTITY=-` goes further and signs ad hoc, which needs no
# certificate at all. Either way the dmg opens on this machine and nowhere else.
#
#   SIGN_IDENTITY     Developer ID Application identity, or - for ad hoc
#   NOTARY_KEY        path to the App Store Connect .p8 key
#   NOTARY_KEY_ID     the key's id
#   NOTARY_ISSUER_ID  the issuer id of the team the key belongs to
#   OUT               where the dmg lands (default ./dist-dmg)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/dist-dmg}"

if [ -z "${SIGN_IDENTITY:-}" ]; then
	echo "set SIGN_IDENTITY to a Developer ID Application identity." >&2
	echo "security find-identity -v -p codesigning lists the ones you have." >&2
	exit 1
fi

VERSION="$("$ROOT/scripts/version.sh")"
STAGE="$OUT/stage"
APP="$STAGE/Spool.app"
DMG="$OUT/Spool-$VERSION.dmg"

NOTARIZING=false
if [ -n "${NOTARY_KEY:-}" ] && [ -n "${NOTARY_KEY_ID:-}" ] && [ -n "${NOTARY_ISSUER_ID:-}" ]; then
	NOTARIZING=true
fi

notarize() {
	local result
	result=$(xcrun notarytool submit "$1" \
		--key "$NOTARY_KEY" \
		--key-id "$NOTARY_KEY_ID" \
		--issuer "$NOTARY_ISSUER_ID" \
		--wait \
		--output-format json)
	echo "$result"
	# --wait has come back with a zero exit code on a rejected submission, so
	# read the verdict rather than trusting the exit code.
	if ! printf '%s' "$result" | grep -q '"status"[[:space:]]*:[[:space:]]*"Accepted"'; then
		echo "Apple did not accept $1." >&2
		echo "xcrun notarytool log <the id above> --key \"\$NOTARY_KEY\" --key-id \"\$NOTARY_KEY_ID\" --issuer \"\$NOTARY_ISSUER_ID\" says why." >&2
		exit 1
	fi
}

rm -rf "$STAGE"
rm -f "$DMG"
mkdir -p "$STAGE"

# The same app a local build gets, copied into a staging folder, so what ships is
# what you have been running.
export SIGN_IDENTITY
"$ROOT/scripts/build.sh"
cp -R "$ROOT/release/mac-arm64/Spool.app" "$APP"

codesign --verify --deep --strict --verbose=2 "$APP"

if [ "$NOTARIZING" = true ]; then
	# The app goes to Apple zipped, because notarytool takes an archive, and the
	# staple lands on the bundle rather than on the zip.
	ditto -c -k --keepParent "$APP" "$OUT/Spool.zip"
	notarize "$OUT/Spool.zip"
	xcrun stapler staple "$APP"
	rm -f "$OUT/Spool.zip"
fi

# The update feed. electron-updater downloads a zip, not a dmg, and reads
# latest-mac.yml off the release to find it and check it. Built from the
# stapled app, so what an update installs is exactly what a download gets.
ZIP="$OUT/Spool-$VERSION-arm64-mac.zip"
ditto -c -k --keepParent "$APP" "$ZIP"
# The blockmap and feed must describe this final archive, after stapling.
node "$ROOT/dist/update-feed.js" "$ZIP" "$VERSION"

# The drag gesture the window is for. hdiutil keeps the link as a link.
ln -s /Applications "$STAGE/Applications"

hdiutil create \
	-volname "Spool" \
	-srcfolder "$STAGE" \
	-fs HFS+ \
	-format UDZO \
	-ov \
	"$DMG"

TIMESTAMP=(--timestamp)
if [ "$SIGN_IDENTITY" = "-" ]; then
	TIMESTAMP=(--timestamp=none)
fi
codesign --force "${TIMESTAMP[@]}" --sign "$SIGN_IDENTITY" "$DMG"

if [ "$NOTARIZING" = true ]; then
	notarize "$DMG"
	xcrun stapler staple "$DMG"
	# What Gatekeeper will say on the other machine, said here first.
	spctl --assess --type open --context context:primary-signature -vv "$DMG"
else
	echo
	echo "no notary credentials, so this dmg is signed but not notarized."
	echo "Gatekeeper will refuse it anywhere but here."
fi

echo
echo "$DMG"
shasum -a 256 "$DMG"
