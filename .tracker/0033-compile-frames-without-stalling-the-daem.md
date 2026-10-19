# #33 · Compile frames without stalling the daemon

- State: closed
- Labels: ready-for-agent
- Parent: #23
- Created: 2026-10-18T17:43:55.599Z
- Updated: 2026-10-18T17:43:57.976Z
- Closed: 2026-10-18T17:43:57.976Z

Found while building the photo booth (#32): during a booth pass over Spool's own canvas (754 frames) the daemon's event loop stalls 136 to 190 ms at p99, and a profile puts 52% of it in building each frame's Tailwind CSS on the main thread. The booth compiles every frame of every project, so this now runs far more often than when only the open page compiled.

`buildFrameCss` in `src/daemon/tailwind.ts` calls Tailwind's `compile(ROOT_CSS, …)` for every frame: it re-reads and re-parses Tailwind's own stylesheet and the project's `tokens.css` each time, then scans the frame's files and builds. Only the scan and build depend on the frame.

## Done when

- A frame's compile no longer blocks the daemon's event loop for more than a few ms at a time (measure p99 lag during a full booth pass on a copy of Spool's canvas, before and after).
- The per-frame cost drops: what is identical across a project's frames (Tailwind's parse, the project stylesheets) is done once per project and reused until those inputs change, without leaking one frame's utilities into another's CSS (Tailwind v4's `build()` accumulates candidates, so a shared compiler is not enough on its own).
- Frame documents stay byte-identical to today's for the same inputs, or every difference is explained.
- Time to all covers on n200 and on the Spool copy measured against main.

*From Linear DEV-132.*

Related: #34, #32, #31

Plane: SPOOL-33

## Comments

### agent, 2026-10-18T17:43:57.970Z

**Liam, 2026-10-02:** **Done, pushed to main (`c71280b9`..`c92a94eb`, 7 commits).** Three review rounds.

- Frame stylesheets (Tailwind scan and build) run in two worker threads; a job's 30 s deadline starts when its worker begins it, and a stuck worker's other jobs move to a fresh one.
- A document is built and cached from one read of its inputs: esbuild gets those bytes, the stylesheet worker scans them, the cache key hashes exactly them. This also fixes a published bug where an edit landing mid-compile left the old document cached under the new hash.
- Hashing yields to the event loop; design folders canonicalize once per compile pass (path checks were about half of the long tasks during a booth pass).
- The etag now carries the webfont revision, so a font resolve reaches the browser (pre-existing bug).
- All 754 + 1449 frame documents and both player bundles byte-identical to main.

Re-measured (3 interleaved rounds, medians, load 4 to 6.6), main → head:

| run | total | per frame p50/p90 | event loop p99/max |
| --- | --- | --- | --- |
| Spool copy, 3 at once | 22.1 → 13.9 s | 82/157 → 54/103 ms | 23/40 → 3.7/29 ms |
| Spool copy, 1 at a time | 29.9 → 27.0 s | 39/66 → 36/60 | 21/37 → 2.8/29 |
| n200, 3 at once | 1.04 → 0.61 s | 15/19 → 8/11 | 9.6/15 → 2.6/3.5 |

During a full booth pass the daemon's busy time fell 75.6 → 53.6 s and health-check p99 to about 21 ms; what remains is many short tasks (per-request design-folder lookups, GC). Time to all covers is unchanged: the booth's browser is the bottleneck.

Follow-up: #34 (each `shared/` import costs esbuild about 40 ms).
