#!/bin/bash
set -euo pipefail

# Builds the presenting module (spool#309): native/presenting.m into dist/presenting.node, beside the main process
# code that loads it (src/presenting.ts). One Objective-C file against Node-API's headers, with no node-gyp and
# nothing to rebuild per Electron version, since Node-API is the same for every Node that carries it.
# `-undefined dynamic_lookup` leaves the napi_* symbols to the process that loads the module, Electron's, as node-gyp
# does for every addon on macOS.
#
# Apple silicon and macOS 14 or later, as the app is (electron-builder.yml). The signature is the app's: build.sh
# signs the bundle with the module inside it, and a release's Developer ID signs every Mach-O in the bundle.

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"

if [ "$(uname -s)" != Darwin ]; then
	echo "the presenting module is built on macOS only"
	exit 0
fi

mkdir -p dist
xcrun clang -x objective-c -std=gnu17 -fobjc-arc -O2 -Wall -Wextra -fvisibility=hidden \
	-arch arm64 -mmacosx-version-min=14.0 \
	-DNAPI_VERSION=8 -I node_modules/node-api-headers/include \
	-bundle -undefined dynamic_lookup -framework AppKit \
	-o dist/presenting.node native/presenting.m
echo "built: dist/presenting.node"
