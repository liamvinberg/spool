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

SETS="$(cd "$REPO" && pnpm exec tsx desktop/scripts/icon.ts | tail -n 2)"
BETA_ICONSET="$(printf '%s\n' "$SETS" | head -n 1)"
ICONSET="$(printf '%s\n' "$SETS" | tail -n 1)"
iconutil --convert icns "$ICONSET" --output "$ROOT/assets/icon.icns"
iconutil --convert icns "$BETA_ICONSET" --output "$ROOT/assets/iconBeta.icns"
rm -rf "$ICONSET" "$BETA_ICONSET"

echo "wrote $ROOT/assets/icon.icns and iconBeta.icns"
echo "wrote $ROOT/assets/markTemplate.png, markBetaTemplate.png and their @2x"
