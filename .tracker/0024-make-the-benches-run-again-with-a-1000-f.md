# #24 · Make the benches run again, with a 1000-frame page and an interleaved runner

- State: closed
- Labels: wayfinder:research
- Parent: #23
- Created: 2026-10-18T17:43:55.511Z
- Updated: 2026-10-18T17:43:57.732Z
- Closed: 2026-10-18T17:43:57.732Z

Every gate on this map needs an instrument that works, and today none of the canvas benches do.

## What is wrong

- `bench/harness.ts` looks for covers in `thumbs/<leaf>`, but since [liamvinberg/spool#336](https://github.com/liamvinberg/spool/issues/336) the daemon writes `thumbs/<encoded full path>`. `bench/canvas.ts` waits its full 600 s for covers that are already on disk, then throws. The fix used in research 113 is `harness/harness-frame-path.patch` there.
- The biggest page in `spool-bench` is 200 frames. The DOM's collapse only shows at 1000.
- The benches run arms sequentially. The machine is shared with other sessions (load average 165 was seen on 2026-10-01), so sequential arms measure whoever else was busy.

## Done when

- All seven benches under `bench/` run to completion on `spool-bench` at a pinned commit.
- `spool-bench` has a page of 1000 frames from the same archetype rotation, at a new pinned commit.
- The harness can run arms interleaved for N rounds with the arm order rotated each round, records the one-minute load average per run, and reports medians plus the worst of the rounds (research 113's `drive.mjs` and `tab2.py` show the shape).
- A short baseline on the new page lands in `spool-cloud/research/`.

This is public-repo tooling; it ships no changeset.

*From Linear DEV-123.*

Related: #37

Plane: SPOOL-24

## Comments

### agent, 2026-10-18T17:43:57.725Z

**Liam, 2026-10-02:** **Done, pushed to main (`734dc58a`..`39325dce`, 8 commits).** Two review rounds; every finding fixed.

- Every bench runs to completion on spool-bench `4e30245` (1449 frames, pages `n200`, `n1000`, and the recovered `dither` page).
- Builds compare with `--builds a=<checkout>,b=<checkout> --rounds N` in `canvas.ts` and `reload.ts`: balanced rotated rounds (N a multiple of the build count), each build's commit and dirty state printed, a shared or stale dist refused, load average read per throttle rate, per reload sample and per cover preparation. Reports a true median of rounds and the worst whole round.
- How to compare: one detached worktree per commit, `pnpm install --frozen-lockfile && pnpm build` in each, then `--builds`.
- Baseline on n1000 (main vs main, spool-cloud `8f78468`): pan p95 25 to 26 ms at 4x throttle, entry about 800 ms, covers from nothing 117 to 119 s, warm reload about 518 ms. Two identical builds differ by up to 7 ms on zoom p95, so a smaller zoom difference at two rounds is noise.

Product findings for the map:

- On a warm reload of n1000, Chromium refuses the first `img.decode()` of 534 to 744 off-screen covers ("The source image cannot be decoded"). The bench now times the covers on screen. The GPU picture layer replaces DOM cover decoding.
- `/flows` takes 835 ms cold and 385 ms warm on 1437 frames (59 ms on 200), because every read revalidates every frame's folder and fingerprint. Not a gesture cost; worth fixing if the booth or first paint waits on it.
