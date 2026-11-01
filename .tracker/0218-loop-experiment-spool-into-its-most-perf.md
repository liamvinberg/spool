# #218 · Loop: experiment spool into its most performant, cleanest state

- State: open
- Labels: ready-for-agent
- Created: 2026-10-31T09:19:46.049Z
- Updated: 2026-10-31T09:19:46.049Z

## Why

Cata, task 323 (2026-10-31): get spool into its most performant and cleanest state, by a loop of experiments that each keep or throw away a change on a measured result, in the spirit of [karpathy/autoresearch](https://github.com/karpathy/autoresearch). Nothing is off limits: rewriting core parts, replacing the live-frame engine, deleting code that only exists to work around something. What must survive is the experience: live, interactive TSX frames that port straight into apps, animations you can feel, Figma-like canvas feel. Liam walks through the result before anything people would notice ships.

## What task 323 found (start here)

The canvas itself is in good shape since #23 (camera outside React, stills on a WebGL2 layer, the photo booth; 120 fps at 1,000 frames). The cost and the friction now sit in **live frames**:

- Spool protects the canvas by stopping them: holds while the camera moves (#171), after a minute unattended (#172), while Edit is on, and when one drags the canvas (`src/ui/canvas/rest-strain.ts`, `motion-strain.ts`).
- Every save reloads the whole frame document (`reloadFrameDocument` in `canvas.tsx`, a new `docNonce`), so the state inside it (the step you clicked to, typed input, an animation) is lost. Sandboxed frames have no storage to keep it.
- A live frame renders WebGL and 2D canvas at full device pixel ratio whatever the zoom: at k 0.3 on Retina that is about 11x the pixels shown. Nothing in `src/runtime` scales `devicePixelRatio`.
- All frames load from one origin (`run.spool.localhost`), so Chrome runs every live frame in one renderer process: one main thread for all of them (sandboxed iframes leave the parent's process since Chrome 127, grouped by site).
- Ruled out: a custom language or DSL (agents are measurably worse in languages they have seen little of, and it breaks porting); HTML-in-Canvas (Chrome 157 stable, but it never paints cross-origin iframes, which spool's frames must be); native HTML renderers such as Blitz (partial CSS, frames would stop matching the app).

Starting hypotheses, best value first:
1. Fast Refresh in frames: an edit swaps components into the running document and keeps state; full reload only when React would refuse.
2. Frames draw at the size they are shown: the shim tells each frame devicePixelRatio x zoom, in steps, at rest.
3. Slow down instead of stop: rAF tiers (frame you're in at full rate, others on screen 30, far 10) through the shim's existing rAF hook.
4. One site per live frame so frames spread over cores; measure memory against it.
5. Mac app only: live frames as Electron offscreen shared textures composited in the GPU layer (WebGPU `importExternalTexture`), with spool forwarding input. The engine-replacement candidate; a spike first.

Also fair game: canvas.tsx is 6,071 lines; compile and Tailwind time; daemon loop lag; cold start; memory; the booth.

## How the loop works

- A `program.md` (rules, scoreboard, benchmark commands) and a live `LOG.md` in the repo (say where), one row per experiment: UTC time, commit, hypothesis, before and after, kept or reverted, and why.
- **The scoreboard comes first.** Find the metrics before optimizing: rows from the existing benches (`bench/canvas.ts`, `entry.ts`, `arrival.ts`, `reload.ts`, `walk.ts`, `qa-editing.ts`, `early-gesture.ts`, `frame-cost.ts`, `loop-lag.ts`, `viewer.ts`) plus new ones the experience needs, such as save to pixels in a live frame, state kept across an edit, how many frames stay animating on screen at full feel, dropped frames with N heavy live frames, memory per live frame, cold start to first live frame, compile time per edit, and lines of code in the core modules. Each row has its noise band measured before it is used.
- A change is kept only if it wins its row beyond noise without losing another, and the suites pass (`pnpm test`, `typecheck`, `check`). Simpler code at equal numbers is a win too. A gate that fails is a finding, not a retry.
- Method from #23 stands: believe nothing that has not been run; interleaved A/B with arm order rotated; one-minute load recorded per run. Fast stage on devobee (shared and often loaded); gate on the m1 (M1 Pro, 120 Hz, headed), as #23's numbers were.
- **The experience is a gate, not a metric.** Keep a list of what a person must never lose (live interaction, animations, hand edits landing in the TSX, walks and the player, no blinks or pops, the feel #145 and #150 fixed). Nothing a person uses is removed without Liam.
- **What ships when.** A win nobody would see except as speed is a fix: merge it to main as it is kept, with a changeset per `docs/releases.md`. A change people would notice (when frames hold, how live the wall is, a new engine) lands behind a name in `experiments` (`~/.spool/config.json`), off by default, and goes on a walkthrough list for Liam to try before it is turned on or its old path deleted.
- Workers in parallel, one experiment each, kept small enough to finish well inside their time limit (task 275's workers kept timing out at 200 to 240 min); reviewers on anything touching saves, sync or hand edits. Daemon rules from AGENTS.md: never stop the shared 7767 daemon, take a lane.
- One thread to check in on: plain reports of the scoreboard as it moves, wake-ups between gates, and a tag when it is ready for Liam's walkthrough.

Related: #23, #107, #129, #145, #146, #150
