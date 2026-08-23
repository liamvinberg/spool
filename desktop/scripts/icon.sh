#!/bin/bash
set -euo pipefail

# Regenerates assets/icon.icns and the menu bar mark from src/brand.ts. Run it
# when the mark or the accent colour changes, and commit what it writes: the
# build copies these rather than drawing them.
#
# It runs from the repo root, because the identity lives there and so does the
# Chromium the renderer uses. `pnpm install` in the root first if this is a fresh
# checkout; the browser itself is fetched on demand by
# `pnpm exec playwright-core install chromium-headless-shell`.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"

ICONSET="$(cd "$REPO" && pnpm exec tsx desktop/scripts/icon.ts | tail -n 1)"
iconutil --convert icns "$ICONSET" --output "$ROOT/assets/icon.icns"
rm -rf "$ICONSET"

echo "wrote $ROOT/assets/icon.icns"
echo "wrote $ROOT/assets/markTemplate.png and markTemplate@2x.png"
