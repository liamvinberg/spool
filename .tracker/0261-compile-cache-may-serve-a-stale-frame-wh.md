# #261 · Compile cache may serve a stale frame when a new file takes over an import

- State: open
- Labels: needs-triage
- Created: 2026-11-10T08:30:12.050Z
- Updated: 2026-11-10T08:30:12.050Z

## Suspected, not reproduced

Found by reading during the sync and compile audit (#254, agent-hub task 557). Nobody has seen it happen yet: reproduce first.

A frame imports `./card`, which resolves to `card.ts`. Someone adds `card.tsx` beside it, which the resolver ranks higher. The files the cached build read are unchanged, so a cache hit on the full frame document or the player bundle hashes the old inputs, finds them equal and serves the old build, though a fresh build would now read `card.tsx`.

Hot modules already check resolution again and the player's style keys include folder listings, so those paths are not affected. Spool Cloud's cached documents check recorded source hashes only, so they would be.

## Where

- `src/daemon/compile.ts:59`, `:106-140`, `:196-214` (frame cache hit)
- `src/daemon/play.ts:120-140`, `:182-200`; `src/daemon/player-compile.ts:118-141` (player)
- `src/daemon/hot-modules.ts:111-125` (the stronger check)
- `src/daemon/design-resolve.ts:10`, `:126-145` (resolution order)
- spool-cloud `src/worker/frames/object.ts:433-447`

## Done when

A test adds a higher-priority file beside a resolved import and the next compile (frame, player, and cloud document) reads the new file. If it can't be reproduced, close with why.
