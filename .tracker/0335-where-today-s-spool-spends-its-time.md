# #335 · Where today's spool spends its time

- State: closed
- Labels: wayfinder:task
- Parent: #333
- Created: 2026-11-13T14:47:10.953Z
- Updated: 2026-11-13T20:51:48.052Z
- Closed: 2026-11-13T20:51:48.052Z

## Question

On the m1, on spool's own canvas (about 740 frames) and on a made-up one of 5,000: where do the milliseconds and the megabytes go today? Opening, panning, zooming, a picture becoming live, an agent's edit reaching the screen, standing idle.

Nothing to decide: this is the measurement the drawing, language and engine decisions are aimed with. `bench/` has harnesses (`canvas.ts`, `arrival.ts`, `entry.ts`, `frame-cost.ts`), run in their own Chromium with their own daemons. Report each number with where the time went (compile, network, the browser laying out and painting, the GPU, React, the daemon), not only the total, and say what could not be split.

Write the results to `~/.brain-archive/spool-foundation/measured-today.md`.

## Comments

### agent, 2026-11-13T15:08:34.676Z

Being measured by a worker of task 634 since 2026-11-13, against the budget settled in #334; results land in ~/.brain-archive/spool-foundation/measured-today.md.

### agent, 2026-11-13T16:47:32.348Z

**First pass, devobee only (task 634's worker, 2026-11-13). Not resolved: the m1 run is still to do.** The m1's screen slot was held by task 668 until 19:44, so this ran on devobee: Core Ultra 9, Intel Arc, Chromium 149 headless, on a loaded machine. Notes and raw results: `~/.brain-archive/spool-foundation/measured-today.md` and `measured-today/` (scripts, fixtures, traces).

What it can and cannot be used for:
- **Frame times are not usable as a baseline.** Headless Chromium on a loaded Linux host ran at 30 to 60 Hz with long tails (p95 100 to 270 ms), and the traced pans spent seconds in ReadPixels, which a minimal WebGL control page also did: an artefact of this setup, not of spool.
- **The engine-side costs are worth carrying forward, with the load in mind:** opening shows a first picture in 2.4 s (own canvas, its largest page of 228 frames) and 5.6 s (5,000 frames), with the longest `/frames` request taking 1.6 s and 6.0 s; an edit to a frame's file shows after 3.6 s and 4.8 s, of which 1.7 s and 2.8 s is the new document's navigation; picture to live takes 6.2 s and 3.0 s and about 4% of pixels differ across the swap; after the pictures were made the daemon on the 5,000-frame project still used over 3 cores, and its esbuild child another 3; the daemon tree held 3 to 4 GiB.
- Facts about the project: 841 frames that draw (856 layout records), largest page 228 frames (`explore/comments`).

To do on the m1, headed at 120 Hz, with the same scripts: pan and zoom, opening, picture to live, an edit, idle.

### agent, 2026-11-13T20:51:48.052Z

**Closed by task 634, 2026-11-13, as answered well enough for what depends on it; the m1 pass of today's real spool did not happen.** The worker waited 89 minutes for the m1's screen slot (other tasks held it) and got only its control run in: a page that draws nothing presented with about 30% of frames late on the loaded m1, the same ceiling the canvas spike found (114 to 115 a second).

What stands in its place:
- **How fast the canvas can be on the m1** is answered by the drawing spike (#343): today's design done again cleanly presented 88 to 117 a second at 1,000 and 5,000 frames, opening in about 0.1 s.
- **Where today's engine spends time** is known roughly, from devobee under load (first pass above): an edit shows after about 3.6 s, half of it the frame's document being loaded again; opening takes about 2.4 s to a first picture, with the frame list request taking 1.6 to 6 s; picture to live about 6 s; the daemon keeps compiling after the pictures are made.
- Not known: those engine costs on the m1 itself. They need no screen (a daemon and a headless browser are enough), so if #345 turns on them, measure them there, headless, without waiting for the slot.

Notes and raw results: `~/.brain-archive/spool-foundation/measured-today.md` and `measured-today/`.
