# #28 · Spike: a photo booth in the daemon

- State: closed
- Labels: wayfinder:research
- Parent: #23
- Blocked by: #24
- Created: 2026-10-18T17:43:55.550Z
- Updated: 2026-10-18T17:43:57.840Z
- Closed: 2026-10-18T17:43:57.840Z

## Hypothesis

A daemon-owned headless browser that loads each frame document at its own size, settles it and takes Chrome's own screenshot makes covers several times faster than the canvas, truer to the frame, and without mounting anything in the canvas.

## Evidence so far

Research 113, section 5: on the 200-frame page with compiles warm, the headless shell with 3 tabs made 200 covers in 15 s (load 29 ms, settle 139 ms, screenshot 29 ms per frame); 8 tabs in 9.3 s; the canvas took 50 to 65 s. The booth photographed a rAF-driven particles frame correctly where the canvas's SVG route shows it blank. Frame documents carry `content-security-policy: sandbox allow-scripts`, so a top-level load keeps the opaque origin. Virtual time cuts the settle to 2 to 6 ms but does not advance rAF in the headless shell; rejected.

## The spike

- In the daemon, next to `shots.ts` and the healer: one lazily started browser, a few long-lived tabs, a queue fed by source changes (`markStale`'s daemon-side twin) and by frames with no cover, writing the same content-addressed covers the canvas reads today.
- Run it over Spool's own `design/` (736 frames, real Tailwind, fonts and assets) as well as `spool-bench`: total time, per-stage times, process memory while working and when idle.
- Fidelity: a contact sheet and a pixel diff against today's covers for every frame, with every disagreement explained. WebGL frames (research 32) under the headless shell's SwiftShader, and under headless Chrome with the GPU if that differs.
- The Mac app: the same booth on a hidden Electron window instead of a headless shell download; time and fidelity.
- Whether the booth should also emit the thumbnail tier the picture layer wants.

## Gate

Spool's own canvas fully covered from nothing in under a minute, no cover worse than today's by eye, and the canvas mounting nothing for a cover while it happens.

Blocked by the bench ticket.

*From Linear DEV-127.*

Plane: SPOOL-28

## Comments

### agent, 2026-10-18T17:43:57.833Z

**Liam, 2026-10-02:** Delivered as research 114 (`spool-cloud/research/114-photo-booth/`, commit `e537a6e`). Spike code is `spike.patch` there; the worktree is gone.

Verdict: **booth only**, with the GPU flags, a colour scheme passed in, a hard time limit from outside the page, page recycling and closing the browser when idle.

- Spool's own canvas, 754 frames from nothing: 151 to 155 s in the booth (3 tabs) against 681 s for the stock canvas page by page. n200: 17.0 s (3 tabs), 12.7 s (4) against 67.8 stock and 26.7 with the quick wins. More than 3 tabs buys nothing here.
- Truer pictures: almost every large disagreement is the canvas missing something (entry animations restart invisible in the SVG image, `showModal()` dialogs, rAF content in borrowed frames, non-data images).
- SwiftShader is the booth's one fault; `--enable-gpu --use-angle=metal --ignore-gpu-blocklist` fixes it (57 of 60 agree with Electron, against 36).
- Memory: 1.6 to 4.8 GB over a pass unless pages recycle every 20 covers (0.66 GB); closing when idle frees all of it.
- Mac app: hidden Electron windows work with no download (60 covers in 11.6 s via the debugger), with three traps recorded.

Open for the decision ticket: covers show a frame's first screen; and whether staged reveals deserve a longer wait (about 70 s per full pass).
