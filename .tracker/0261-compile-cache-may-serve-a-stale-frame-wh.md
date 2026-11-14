# #261 · Compile cache may serve a stale frame when a new file takes over an import

- State: open
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-10T08:30:12.050Z
- Updated: 2026-11-13T14:47:31.356Z

Part of #284: this is fixed before the extensions skeleton (#285) builds on the compile cache.

## Real by reading, not yet reproduced

Found during the sync and compile audit (#254, task 557) and read again on 2026-11-12 against main at 0.56.0 (task 634): the code does what the suspicion says. Nobody has seen it happen. Reproduce it first, as a failing test.

A frame imports `./card`, which resolves to `card.ts`. Someone adds `card.tsx` beside it, which the resolver ranks higher (`src/daemon/design-resolve.ts`, the order at line 10 and the resolution around 113 to 127). The files the cached build read are unchanged, so a cache hit hashes the old list of inputs, finds them equal and serves the old build, though a fresh build would now read `card.tsx`.

- **A frame's document**: the cache is keyed by root and stamp (`src/daemon/compile.ts` around 96 to 101); a hit checks the webfont revision and the hash of the inputs recorded last time (108 to 118, `hashInputs` at 196 to 213). It never asks the resolver again.
- **The player's bundle**: the same gap (`src/daemon/play.ts` around 168 to 184). The stylesheet's cache does hash the folder listings beside its inputs (`src/daemon/player-compile.ts` 118 to 140), but that code is not reached when the whole bundle hits, so it does not save the player.
- **Hot modules** already do it right: they check each recorded resolution again (`src/daemon/hot-modules.ts` around 111 to 120). That is the check to copy.

## What to build

A cached build records what each import resolved to and where the resolver looked, and a hit is only a hit when asking again gives the same answers, as hot modules do. For a frame's document and for the player's bundle. Keep a hit cheap: no compile, no reading of file contents beyond what is hashed today.

## Leave alone

- The compiler's graph and its caches as a whole (#254 gets its own spec). This is the one hole, closed the way the code already closes it elsewhere.
- **spool-cloud**. It has the same gap (`src/worker/frames/object.ts` around 442 to 444 compares recorded source hashes only), and a fix there is a deploy. Do not change it: say in the handoff what the fix there would be, and task 634 files it.
- What the extensions skeleton adds to the compiler's identity (a compile part's id and version). That is #285 and a different thing: a transform's version does not change when a file appears.

## Done when

- A test adds a higher-ranked file beside a resolved import, and the next compile of the frame's document and of the player's bundle reads the new file. The test fails before the fix.
- A second build with nothing changed is still a hit (no slower: say the hit's time before and after on spool's own canvas).
- If it cannot be reproduced, close with why, and say so to task 634 before #285 is held any longer.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`. A changeset (a stale frame is something a person can see). A message to task 634 when it is merged.

## Comments

### agent, 2026-11-13T14:47:31.356Z

No longer part of #284 (closed, superseded by the ground-up rebuild, map #333). Still a real bug in today's spool, which stays Liam's daily tool: ready to fix on its own. Report to task 634 as written, or simply close when merged.
