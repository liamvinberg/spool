# #23 · Wayfinder map: renderer performance, pictures on the GPU and a photo booth

- State: closed
- Labels: wayfinder:map
- Created: 2026-10-18T17:43:55.502Z
- Updated: 2026-10-18T17:43:57.705Z
- Closed: 2026-10-18T17:43:57.705Z

## Destination

The canvas holds the display's refresh rate through every pan and zoom at any frame count and any zoom, and a frame's cover is current within about a second of the frame changing, whether or not anyone has its page open. Done when the rendering and capture model is decided and specced the way [Canvas rendering and pacing model](https://github.com/liamvinberg/spool/issues/107) was, each part proven by a spike inside the real canvas or daemon against a bench gate. Building follows the spec as its own tickets.

## Foundations (from Liam, 2026-10-01)

- The goal is the most performant state Spool can reach, including screenshot (cover) rendering and everything around it.
- Rewriting the core of the renderer is acceptable. Using the GPU where it helps is wanted.
- Learn from other open-source tools and published work, then decide.
- Work in a loop: spike, measure, decide, and only then build.

## Notes

- **Read first:** `spool-cloud/research/113-renderer-performance/` (committed 2026-10-01). Explainer with charts: <https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/renderer-performance.html>
- What the study found, in one line each:
- Every wheel tick re-renders the whole canvas in React: 4 ms main thread per pan tick, 6 to 9 ms per zoom tick, against an 8.3 ms frame at 120 Hz. Writing the camera straight to the DOM costs 1.1 to 1.4 ms.
- No DOM arrangement carries 1000 frames on an overview: today's structure stalls up to 275 ms (707 ms under load), a tuned and culled DOM up to 440 ms (1.7 s under load). A WebGL picture layer held the refresh rate at every zoom and count, 0.3 to 1.5 ms main thread per frame, and stays in exact lockstep with a DOM overlay of live iframes.
- A cover takes 708 ms median and up to 3.3 s. `canvas.toBlob()` waits up to a second for idle time in the capture worker (Chromium's 1000 ms idle-start timeout on Mac), the frame settles twice (about 230 ms each), and errand slots idle about 125 ms waiting for the sweep.
- A headless photo booth (daemon-owned browser, Chrome's own screenshot) made 200 covers in 9 to 15 s against 50 to 65 s in the canvas, and photographs rAF-driven frames the canvas route shows blank.
- The July decisions stand: live documents are bounded, mounting is caused, covers are content-addressed ([liamvinberg/spool#107](https://github.com/liamvinberg/spool/issues/107)). This map changes how pictures are drawn and where they are made, not how many documents may live.
- **Method (from liamvinberg/spool#81, kept):** believe nothing that has not been run. Headed browser, interleaved A/B with the arm order rotated, one-minute load average recorded per run. The machine is shared with other sessions; a run under load says so.
- **The loop:** every spike ticket states its hypothesis, its instrument and its gate before it runs, and lands its numbers in `spool-cloud/research/` before the decision ticket it blocks can close. A gate that fails is a finding, not a retry.
- Children are sub-issues labelled with their wayfinder type, with native blocked-by relations. Claim one by assigning it.

## Decisions so far

- Land the cover quick wins (#25): covers encode with `canvas.toDataURL()` at once, a capture skips its settle only after a quiet arrival of the current document, and the next errand starts when a cover lands. n200 from no covers 64.8 to 69.5 s → 34.1 to 37.0 s, covers byte-identical, failed captures gone. Pushed.
- Benches run again (#24): every bench completes on spool-bench `4e30245` (1449 frames); `--builds` compares commits in balanced rotated rounds with load recorded. n1000 baseline: pan p95 25 to 26 ms at 4x throttle, covers from nothing 117 to 119 s, warm reload 518 ms. Pushed.
- The camera outside React (#26): one camera store drawn once per frame, every follower subscribes and writes its own styles, React hears the camera only at rest. Main thread per wheel tick down 35 to 60% (zoom 7 to 8.6 ms → 3.2 to 3.9); the 1.5 ms gate missed because the rest is Chrome's own layerization and hit testing, which only the GPU layer removes. Pushed.
- Photo booth spike (#28): research 114. A daemon-owned headless shell covered Spool's 754 frames in 151 to 155 s against 681 s on the canvas, with truer pictures; needs GPU flags, a colour scheme, page recycling and closing when idle; works on hidden Electron windows in the Mac app. Recommends booth only, pending #29.
- Where covers are made (#29): booth only, the pinned headless shell with GPU rasterization in both the CLI and the Mac app, fed by the change hub for every project, on-screen frames first, a cover is the first screen, the canvas's errand machinery and cover routes deleted. Decided by the agent on Liam's delegation (2026-10-02).
- The photo booth, built (#32): the daemon makes every cover; n200 from nothing 16 s vs 25 s, Spool's 754 frames 136 to 141 s vs 400 to 422 s, edit to new cover 325 vs 430 ms, canvas frame times unchanged during a pass, booth browser about 780 MB median then closed; the canvas's errand machinery deleted (net about −1,350 lines). Pushed.
- Compiles off the event loop (#33): frame stylesheets in worker threads, one read per compile (fixing a stale-cache race), etag carries the webfont revision. Spool copy at 3 compiles in flight 22.1 → 13.9 s, event-loop p99 23 → 3.7 ms; documents byte-identical. Pushed.
- Cheap shared/ imports (#34): the daemon answers `shared/` imports itself with esbuild's rules instead of a fresh uncached resolver per import. Spool copy compile 30.2 → 20.4 s, player build 12.4 → 7.0 s; byte-identical. Pushed.
- GPU picture layer (#27) and its design (#30): stills drawn by one WebGL2 canvas in the camera callback; n1000 overview pan/zoom slow frames 27/49.5 → 0.5/8.5, reload n1000 1.79 → 0.79 s, n200 634 → 502 ms; remaining zoom misses are DOM labels (#35). Pushed.
- Link graph without revalidation (#37): stat witnesses with a 60 s content proof; `/flows` warm 362–565 → 26–31 ms on 750 to 1,449 frames, graph identical. Pushed.
- GPU labels (#35): built and rejected; 1 → 0 slow frames was not worth a second context per tab and a hand-made text layout.
- The spec (#31): public ADR-0010 on main. Map closed 2026-10-03.

## Not yet specified

- Whether the SVG capture route survives for exports only, or goes (exports still use it; out of this map).

## Out of scope

- Export fidelity: settled in the website-capture map (spool-cloud#147); exports keep the rendered-clone route whatever happens to covers.
- Frame boot cost (module graph prebundling, risk 4 of liamvinberg/spool#107): passes its bars today; a later map if a gate here says otherwise.
- Terminal frames and their renderer.

*From Linear DEV-122.*

Plane: SPOOL-23
