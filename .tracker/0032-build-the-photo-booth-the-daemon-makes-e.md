# #32 · Build the photo booth: the daemon makes every cover

- State: closed
- Labels: ready-for-agent
- Parent: #23
- Blocked by: #29
- Created: 2026-10-18T17:43:55.589Z
- Updated: 2026-10-18T17:43:57.952Z
- Closed: 2026-10-18T17:43:57.952Z

Build what #29 decided: the daemon makes every cover in the pinned headless shell, and the canvas stops photographing frames. Starting point: research 114's `spike.patch` (`src/daemon/booth.ts`).

## Done when

- Every cover is made by the booth: change-hub events and cover-less frame reads feed one queue, on-screen frames first, an edit jumps the backlog, pages nobody has open are covered too.
- The headless shell launches with GPU rasterization, is fetched without blocking the daemon, gets a fresh page every 20 covers and closes when the queue drains; a deadline outside the page bounds every job.
- Covers render the colour scheme the canvas shows; a cover is the frame's first screen.
- `spool shot` and covers share the booth's browser and settle.
- Deleted: lifecycle causes 2 and 3 (errands, cap, tries, staleness, `markPictureWrong`, `refreshing`, capture waits), the cover PUT and error routes and their callers, the one-at-a-time healer. The shim's capture route stays for exports.

## Gate

Interleaved against main, load recorded: all covers from nothing on n200 and on a copy of Spool's own canvas; edit to new cover on an open canvas; canvas frame times while a pass runs; browser memory over a pass and after it drains; daemon event-loop lag during a pass; a fidelity contact sheet of the largest differences. `pnpm test`, `pnpm typecheck`, `pnpm check`.

*From Linear DEV-131.*

Related: #33, #31

Plane: SPOOL-32

## Comments

### agent, 2026-10-18T17:43:57.946Z

**Liam, 2026-10-02:** **Done, pushed to main (`39325dce`..`2541cd2b`, 22 commits).** Three review rounds; every finding fixed with a test.

Measured against main (interleaved, load recorded; evidence kept locally in the worker's run):

- All covers from nothing: n200 15.9 to 16.4 s vs 25.1 to 25.2 s; a copy of Spool's canvas (754 frames) 136 to 141 s vs 400 to 422 s of page time (568 to 591 s wall).
- Edit to new cover on an open canvas: 325 to 329 ms median vs 428 to 435 ms (the browser stays 30 s after the queue drains).
- Canvas frame times during a pass: unchanged (p95 10.0 vs 10.1 ms idle). Background priority for the booth browser bought nothing and made passes 6 times slower, so it is not used.
- Booth browser footprint over a 754-cover pass: median about 780 MB with a fresh page every 10 covers (940 MB at 20), 0 after it closes. Daemon peaks 0.57 GB with compiled documents released (1.78 GB without).
- Fidelity: 527 of 754 within 1% of main's covers; all 24 over 20% are main's route being wrong (14 WebGL or rAF drawing, 9 finished entry animations, 1 `showModal` dialog).

Design in short: one queue fed by every project's change hub and cover-less reads, ordered by what open canvases report at camera rest; the pinned headless shell with Metal GPU flags on macOS, 3 tabs, a deadline around every sitting enforced from the daemon, a launch deadline, the scheme frames actually see (checked: a cross-origin frame follows the browser, not the canvas root). `spool shot` and `logs` boot in the same browser. Deleted: the canvas's errands, `refreshing`, the cover PUT/error routes, `shots.ts` and the healer (`lifecycle.ts` 1,299 → 721 lines; net about −1,350 lines).

Follow-ups: #33 (frame compile stalls the daemon 136 to 190 ms p99 during a pass, mostly Tailwind).
