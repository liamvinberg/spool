# live frames at scale

Throwaway spike for [Test: live frames at scale](https://github.com/devosurf/spool/issues/8): does a canvas full of live sandboxed frames stay fast enough to build on? 63 srcdoc iframes (`allow-scripts`, null origin — the spool frame model) on the bake-off's home-built canvas, under a snapshot/warm/live lifecycle, instrumented to the teeth. Deletable without ceremony.

Extended for [Test: React frames at scale](https://github.com/devosurf/spool/issues/17): the same 63 screens rebuilt as compiled TSX components (`src/screens-react/`), loaded per frame via import map against one pinned react ESM bundle and a ~22 KB minified Tailwind stylesheet inlined into every frame document — the #16/#15/#12 serve model in miniature. Open with `?frames=react`; `pnpm bench` runs both variants.

## Run

```sh
cd spikes/live-frames
pnpm install
pnpm dev
```

Chrome. The HUD (top right) is the point: every number updates live while you feel the canvas.

```sh
pnpm shots                  # playwright thumbnails → public/shots (enables the toggle, reload after)
pnpm build && pnpm bench    # scripted benchmark → capture/results.md (headed Chrome; HEADLESS=1 for headless)
```

## What to feel

- **Boot**: all 63 frames hydrate at once (~0.4–1.3 s storm, timed in the HUD). Default mode is **live · near plays** — frames near the camera run, far ones freeze in place; zoom into anything and it wakes up.
- **design · all frozen** is the design-mode preview: time stopped everywhere, but every frame is real DOM — crisp at any zoom, and the surface element-click-for-agent will later live on. Double-click deliberately does nothing here — in design mode clicks are for selecting, not entering. **stills · click-to-play** goes further: nothing mounted, images only (pre-rendered playwright shots as fallback after a reload), double-click boots a frame fresh.
- **Pan/zoom in all-live** — the stress mode. Watch fps and the tick buckets: offscreen frames report 0 (Chrome pauses their rAF entirely), visible ones vsync at ~120.
- **Zoom to fit in all-live** and watch the visible-live tick bucket explode: Chrome *free-runs* rAF in tiny-rendered frames (500–1300 Hz each). This is the one regime that burns CPU for nothing — flip to viewport-warm and watch it die.
- **viewport-warm freezes time, not pixels**: demoted frames keep their real DOM on canvas — crisp at any zoom, no thumbnail — with time stopped inside (a shim injected before each frame's own scripts holds rAF callbacks and skips interval ticks; clocks halt, particles hang mid-air). Promote back to live and time resumes. Thumbnails now only cover unmounted frames and boots.
- **Double-click a frame** to go hands-on (purple ring): type in a **scratchpad**, click buttons, hover things. Esc or click outside to exit; drag/select still works on everything else. Works on frozen frames too — they boot fresh on entry, so **all-snapshot doubles as a click-to-play mode**: stills everywhere, double-click to play, leave to freeze. Frozen frames carry a ▸ in their label.
- **The state demo**: type something into a scratchpad. In viewport-warm, pan far away and come back — it's still there (the frame froze in place, nothing was lost). In viewport-snapshot, wait out the 2 s grace — the frame captures a goodbye thumbnail, unmounts, and your text is gone on return; it boots back fresh, in its designed state. That's the warm-vs-snapshot trade in one gesture.
- **Thumbnails**: `capture all` self-captures every mounted frame (63 in ~0.7 s, in-page, foreignObject rasterization — canvas content special-cased). After `pnpm shots`, flip the source toggle to compare fidelity against playwright's 2× shots.
- **bench all** runs the same deterministic camera tour the runner uses, per policy, and shows the table.

## The numbers (M1 MacBook, Chrome 150, 2026-07-20)

`capture/results.md` holds the latest scripted run; ranges below are across several runs. Tour = fit → full-field pan both ways → zoom in → out → zoom pulse, ~8.4 s per policy, prod build.

| | all-live | viewport-warm | viewport-snapshot | all-snapshot |
|---|---|---|---|---|
| avg fps | 102–117 | 101–117 | 102–106 | 120 (cap) |
| p95 frame | 10–17 ms | 10–18 ms | 16–18 ms | ~10 ms |
| long frames (>33 ms) | 1–13 of ~900 | 0–24 | 15–23 | 0 |
| browser RSS total | ~1.2 GB | ~1.2–1.3 GB | ~1.2–1.3 GB | ~0.9 GB |
| renderer processes | 3 | 3 | 3 | 2 |

- **63 live frames hold 100+ fps** under an aggressive tour on a 120 Hz display. The wrist never notices.
- **No process-per-frame**: all srcdoc frames share one renderer (3 total incl. the page's). The site-isolation memory fear is dead. Marginal cost ≈ **4–5 MB per live frame** (~300 MB for 63 over the snapshot floor).
- **Chrome does most of the lifecycle for free**: offscreen live iframes get rAF fully paused (0 ticks); visible ones vsync-lock at 120.
- **The exception — overview zoom**: frames rendered tiny stop being compositor-driven and their rAF free-runs at 500–1300 Hz each, spinning the shared renderer thread (reproduced in bare Chrome, no automation flags). A zoom threshold that demotes below ~15% zoom is load-bearing, not a nicety.
- **viewport-snapshot's cost is remount jank**: panning into cold regions storms remounts mid-gesture (p95 ~17 ms, ~20 long frames) and in-frame state dies. It's a hibernation mode for huge canvases, not a default.
- **Hydrate storms are fine**: 63 frames boot in 0.4–1.3 s; 59 remounts in ~160 ms warm-cache. Thumbnail-first boot would mask even that.
- **React is not the bottleneck**: all-snapshot (identical React work, no iframes) pegs the 120 Hz cap — reconciling 63 frame wrappers per camera frame costs nothing measurable at this scale.
- **Capture-on-settle matters**: rasterizing goodbye thumbnails mid-fling measurably janks the tour (main thread is shared); deferring captures until the camera stops (400 ms) got it back. Same lesson will apply to any per-frame work the runtime schedules.

## React frames (M1 Pro MacBook, Chrome 150, 2026-07-21)

`capture/results.md` holds the paired run — same machine, same day, fresh browser per variant. The #17 verdict in numbers:

| | vanilla | react | read |
|---|---|---|---|
| all-live tour | 107 fps · p95 16.6 ms | 107 fps · p95 16.5 ms | identical — React costs nothing at tour time |
| boot hydrate storm (63 frames) | 338 ms | 849 ms | +8.1 ms/frame for module fetch + eval + render; thumbnail-first boot already covers it |
| marginal memory per live frame | 3.6 MB | 5.7 MB | +2.1 MB/frame — top of #16's +1–2 MB estimate, ~130 MB extra at 63 live |
| self-capture sweep | 1031 ms | 1081 ms | unchanged |
| viewport-snapshot | 106 fps · 18 long | 102 fps · 23 long | remount storms now pay React re-eval too — hibernation stays a non-default |

The in-frame lifecycle behaves identically: visible live frames vsync-lock, offscreen rAF pauses (the loaded report must not gate on rAF for exactly that reason), warm freeze holds React frames the same way it holds vanilla ones, and interaction through the sandbox drives `useState` state fine.

## Thumbnails: self-capture vs playwright

| | in-page self-capture | local playwright |
|---|---|---|
| 63 frames | ~0.7 s total | ~25 s cold (≈400 ms/frame, 350 ms of it settle wait) |
| fidelity | faithful incl. `<canvas>` content (special-cased); 1×; system fonts only | pixel-perfect compositor output at 2× |
| needs | nothing — postMessage + foreignObject | playwright + chromium on disk |
| fails on | external images/fonts inside frames (foreignObject limits) | nothing observed |

Read: **self-capture is the ambient thumbnail path** (lifecycle demotions, overview zoom) — free, fast, good enough. **Playwright is the deliberate-shot path** (`spool shot <frame>` for agents, exports) — slow to sweep but exact, and per-frame on demand is ~asset-quality. They compose rather than compete.

## What this spike deliberately ignores

Persistence, flows/player, agent CLI, WebKit (Chrome-first already decided), touch input, frames heavier than a rAF particle sim, thumbnail invalidation beyond demote/settle.

## Recommendation (provisional — react to the demo)

Live frames at scale are **viable, comfortably**. The mode model that emerged from Liam's reactions: **live mode** (default) = viewport-warm — frames near you play, far ones freeze as real DOM (crisp, state kept, kills the tiny-frame free-run); **design mode** = all-warm — time frozen everywhere, the future element-select surface; **stills/hibernation** = snapshot tiers for huge canvases and cold boots. Per-frame "always play" pin later for hero screens. Self-capture for ambient thumbs (2×, canvas-aware), playwright shots as the persistent fallback and the CLI's deliberate-shot path. Boot thumbnail-first, hydrate behind it.
