# #303 · The played frame arrives sooner

- State: closed (done: merged to main)
- Labels: ready-for-agent, enhancement
- Parent: #300
- Blocked by: #301, #302
- Created: 2026-11-11T21:22:56.771Z
- Updated: 2026-11-12T18:05:14.982Z
- Closed: 2026-11-12T18:05:14.982Z

## Parent

#300

## What to build

The frame shows up sooner after play, in the Mac app and in a browser tab. Use the timing marks from the first ticket (add the same marks for a browser tab) and keep a change only when the marks show it helps.

In the order the scouts ranked them:
1. **Warm on intent.** Start preparing the frame's playable when the pointer shows intent to play (reaching the play control), not only on the canvas-open timer, which today waits and can be pushed back a long way by thumbnail work. A press on a warm frame should find the compile done.
2. **Nothing extra gates the first reveal.** The frame's geometry and the default scenario seed travel with the documents that need them, so the first reveal waits on no separate fetch. Live geometry updates still arrive afterwards and are applied as now.
3. **Shell loads faster.** The outer document preloads the shell and React. The runtime bundles are minified, in the source checkout and in the published build. The real bar is in the first paint of the outer document where that is cheap to do.

Leave alone unless the marks say they cost real time, and say so if you touch them: the arrival motion (the dissolve, the spool mark after a long wait) and the reveal gates that stop wrong-size first paints. They are tuned and have tests for the races they prevent.

## Acceptance criteria

- [ ] Before and after numbers for shell painted and frame revealed, for a warm frame and a cold one, in the Mac app and in a tab, are in the handoff.
- [ ] For a warm frame, the frame is revealed within about 300 ms of the press on the m1. If missed, the handoff says what is left and what it would take.
- [ ] No wrong-size first paint, no flash; the existing reveal and geometry race tests pass.
- [ ] Warming on intent and the reveal without extra fetches are covered by extending the existing play-serve and parity tests.
- [ ] A changeset.

## Comments

### agent, 2026-11-12T18:05:14.982Z

Merged to main in 4d107b4e (task 619). Done: on a 133-frame project in the Mac app, frame revealed median 905 ms → 138 ms for a warm frame (no stalls over 800 ms, was 11 of 18), 283 → 133 ms just after an edit; tab 175 → 165 ms idle, 990 → 755 ms under load. Minify, modulepreload and the first-paint strip were tried and dropped: the marks showed no gain. After review the bridge reveals on the served geometry at once, never waiting on a /frames request at connect.

Builder's handoff:

# t303 — spool#303 the played frame arrives sooner

Branch of worktree `619-implement-spec-300-when-every-ticket-has--spec-619-t303`, on base f90be072. Clean tree, 17 commits. Questions and open points are at the bottom; none blocks a merge.

## What shipped (net diff vs f90be072)

1. **Press mark in a tab.** Commit d49e3e2a `canvas: mark the press on play for a played tab's timing`.
   - `playFrame` (`src/ui/canvas/canvas.tsx`) takes `performance.mark("spool-play:press")`, so a tab's marks can be read against the press, as the app's already were.
2. **Seed rides in the document.** Commit f41f0dbe.
   - `PlayerConfig.seed?: { state }` is new in `src/daemon/play.ts` and `src/runtime/frame-runtime.ts`.
   - The `/play/` route reads the scenario with `scenarioSeed(root, name)` in `app.ts` and serves it in the config.
   - The runtime seeds from `play.exported ?? play.seed ?? await loadScenario(...)`. A document that carries the seed asks for nothing. This is the shape #304's export wants: it can fill `exported` (or `seed`) and nothing else is needed.
   - If the scenario doesn't read, `seed` is absent and the runtime fetches it as before, which still reports the error.
   - Test: `player-runtime.test.ts` asserts no `/scenarios/` fetch. It fails without the change.
3. **The bridge reveals on the geometry it holds.** Commit 22f9dd6a, the inline bridge in `assemblePlayerShell` (`app.ts`).
   - The shell config's `frames` is the geometry the bridge holds.
   - It asks `/api/p/:project/frames` once, only after the `/events` stream opens, or in `finally` when no stream opens.
   - A `spool-player-geometry-request` fetches only while subscribed and while the held geometry isn't current, or a fetch is already in flight.
   - So a document with its geometry baked in reveals with no geometry round trip.
   - Test: `player-parity-browser.test.ts` "reveals on the geometry it holds, asking nothing more once the played document connects". It fails on the old bridge.
4. **Warm on intent.** Commits d37f5a1f and 8e1ede86.
   - New `POST /api/p/:project/warm` returns 204. It calls `playerWarmers.get(root)?.now()`, which starts a composition still waiting (edit debounce or booth patience) at once. It skips the booth wait and never recomposes one that is composed or composing. A project no canvas keeps warm is left alone.
   - `DaemonOptions.playerWarmMs` (default 1500) is new, so the test needn't wait.
   - Canvas side: `postWarmPlay(project)` in `src/ui/api.ts` is fire-and-forget. `FrameLabel` takes `onPlayIntent`, and `PlayButton` fires it `onPointerEnter`.
   - Tests: `play-serve.test.ts` "composes a project for play at once when the pointer reaches for play" fails without the change. `frame-label.test.ts` extends "offers play…" so a pointer over Play calls `onPlayIntent("landing")`; that fails without the wiring.
   - I proved it at the label, not in `canvas-play.test.ts`. A hover over the canvas makes frames go live, and happy-dom then logged ECONNREFUSED loading their iframes. That was the intermittent noise; it is gone.
5. **Changeset.** `.changeset/play-arrives-sooner.md` (patch).

## Dropped: tried, measured, reverted (commits kept in history)

| Change | Why dropped |
|---|---|
| Minify the runtime bundles (tsup + `vendor.ts`), 5ebcf0f8 → reverted by aa2256b5 | Tab on m1, 3 interleaved rounds × 10: reveal median 162 ms without it vs 168 ms with it. Localhost bytes and Chromium's code cache make it noise. |
| Import map first + `modulepreload` of shell and React, d1045926 → reverted by 6ede85cb | Same rounds: no-preload 168 ms vs head 168 ms. Shell-painted maybe ~5 ms, inside the noise. |
| Bar strip in the shell's first paint, 5bdccffa → reverted by 53e1328d | First-paint and shell-painted marks unchanged: no-strip 170 ms vs 168 ms. |
| `GET /api/p/:project/geometry` (boxes only, cheaper than `/frames`) with the bridge on it, efbc4507 + 9ef6c528 → reverted by 227497ea + 424b9e48 | No measured effect in the app or the tab. With change 3, `/frames` no longer gates the reveal. It would also add API surface. |

## Numbers

All marks are measured from the press.

**Mac app, m1 lane**
- Setup: a 133-frame copy of the agent-hub design (`proj133`), frame `chuff-01-puff`.
- Variants are source daemons adopted by the lane's app. `final` and `base` were interleaved, two rounds each.
- `warm` means the frame is unchanged; `fresh` means the spare was destroyed first.
- `cold-frame` and `cold-shared` mean the frame's `frame.tsx`, or `shared/tokens.css`, was touched 0.5 s before the hover. The pointer dwells 250 ms on Play before pressing.

| frame-revealed | base (f90be072+mark) median / p75 / plays >800 ms | final median / p75 / >800 ms |
|---|---|---|
| warm (n=18/20) | 905 / 1891 / 11 | **138 / 145 / 0** |
| fresh window (n=8/7) | 992 / 1985 / 5 | **218 / 222 / 0** |
| cold frame (n=8) | 283 / 1905 / 3 | **133 / 157 / 0** |
| cold shared css (n=8) | 3023 / 3539 | **1821 / 1964** |

- Window-shown and shell-painted didn't change (~30 ms and ~80 ms spare; ~60 ms and ~160 ms fresh).
- Base stalls at about 0.9 or 1.9 s on roughly half of all plays. Final has none.

Ablation in the app (one change removed at a time, same harness):
- **Without warm-on-intent:** stalls come back (930 ms seen), cold frame goes to ~265 ms (vs ~120) and cold shared to ~2080 ms (vs ~1500).
- **Without seed, or without the bridge change:** nothing measurable on an idle m1. Both are kept as the document shape the ticket asks for (see Q1).

**Browser tab**
- m1, the HEAD build at the time vs base: warm 175 → 165 ms; cold shared 1837 → 1387 ms.
- devobee under load (~20–34 on 22 cores), the same: warm reveal 990 → 755 ms.
- Base's resource trace on devobee showed the reveal waiting on a second `/frames` request that came after the inner document. The new bridge has one, off the reveal path.
- On an idle machine, no single change moved the tab's marks beyond noise.

Harness (not committed): `/tmp/spec619-t303/{tab.mjs,play303.mjs,appablate.sh,devablate.sh}`; logs `/tmp/spec619-t303/*.log`, with the final table from `appfinal.log`.

## Checks

- `pnpm typecheck` clean, `pnpm check` clean, `pnpm build` ok.
- `pnpm test:changed`: 1195/1196. The one failure is the flaky deck `stage.test.ts`; it passes on rerun twice.
- Touched suites: player-runtime, play-serve, player-parity-browser, play-tab-browser, geometry-browser, canvas-play, frame-label. 112/112.
- I didn't run the full `pnpm test`; the brief listed the touched suites instead.
- Lanes are all stopped: devobee 7931/7932, and the m1 app and daemon on 7919/9619/9620. The m1 lane's `app/` holds a build of an intermediate HEAD (0.56.0); its scratch variant dirs are deleted.

## Open questions / notes

1. **Seed and the bridge change are kept without a measured win on their own.** They are what makes a document carrying seed and geometry need nothing else, which the ticket asks for. Under load, the trace shows the round trip the bridge removes was on the reveal path. Recommendation: keep both. If you read the rule "keep only what the marks show" strictly, both are clean single commits to revert (f41f0dbe, 22f9dd6a).
2. **Base's ~0.9/1.9 s stalls are gone with warm-on-intent, but not fully explained.**
   - My best reading: a composition left waiting by the edit debounce or booth patience gates the press, and the press now kicks it on hover.
   - The old bridge's 1 s fallback and 1 s `/events` retry match the quantization too.
   - A press with no hover first (the keyboard `p`) gets no warm. If a stall like this matters there, the `p` key path could call `warmPlay` too. Not done: it changes nothing anyone sees, and I have no mark showing it.
3. Cold shared-CSS plays are still ~1.8 s in the app. That is the composition itself, which this ticket doesn't change.
