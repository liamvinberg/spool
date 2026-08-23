#!/bin/bash
set -euo pipefail

# Regenerates Resources/AppIcon.icns from the mark in SpoolKit. Run it when the
# mark or the accent colour changes, and commit what it writes: the build copies
# the .icns rather than making one, so a release never depends on a toolchain
# being able to draw.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICONSET="$ROOT/.build/AppIcon.iconset"

rm -rf "$ICONSET"
swift run --package-path "$ROOT" icon "$ICONSET" > /dev/null
iconutil --convert icns "$ICONSET" --output "$ROOT/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "wrote $ROOT/Resources/AppIcon.icns"
