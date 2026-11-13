# #301 · Mac app: the play window shows at once, from a warm spare

- State: closed (done: merged to main)
- Labels: ready-for-agent, enhancement
- Parent: #300
- Created: 2026-11-11T21:22:56.735Z
- Updated: 2026-11-12T18:05:13.900Z
- Closed: 2026-11-12T18:05:13.900Z

## Parent

#300

## What to build

In the Mac app, pressing play puts the player window on screen at once.

Today the main process asks the daemon for the frame's size, makes a hidden window, and shows it only after the page first paints or one second passes. Liam's words: "opens after a sec or so, just feels bad, want a window to open instantly and sure it can load".

Build, in this order:
1. **Timing marks** for a play in the Mac app: press received, window shown, shell painted, frame revealed. Log them per play. Record the numbers before changing anything.
2. **Show first.** No awaited request between the press and the window showing. The window is created and shown at once, dark, at the remembered rect or fitted to the frame's size. The size comes from something already in hand at press time (your choice how; it must not be a request the show waits on, and it must not turn play into a popup in a browser tab).
3. **Warm spare.** While a canvas is open, keep one hidden play window ready on the same origin with the same preferences, already showing the dark page and the bar's strip. A press adopts it: placed, titled, shown, then pointed at the play URL, with no flash between the strip and the real bar. Make the next spare only after the adopted window has revealed its frame. Show first is the fallback whenever no spare is usable (app just started, daemon restarted or its assets changed, a remote project on another origin).

Rules for the spare:
- One at most. Idle while hidden: no timers, no animation, no open connections.
- It is not a window to the rest of the app: it does not keep the app running when the last real window closes, does not appear in window lists or menus, never takes focus, and is dropped when no canvas is open.
- Everything a play window has today still holds once adopted: remembered rects, the minimum size, the title, reset, recording's reopen.
- **It never holds a handoff or anything minted ahead for a frame.** Authored frame code runs only on the render origin behind a single-use handoff minted for that play, exactly as now.

Scope: the desktop main process and its tests, plus at most one small daemon route if the spare needs a page to sit on. Leave the shell runtime's boot code alone; the next tickets change it.

## Acceptance criteria

- [ ] A play in the Mac app logs the four marks.
- [ ] With a spare ready, the window is on screen with its bar strip within about 100 ms of the press, measured on the m1. If that is missed, the handoff says by how much and why.
- [ ] With no spare, the window still shows at once, dark, and loads.
- [ ] Remembered rects, fit, title, close and recording's reopen behave as before.
- [ ] Quitting, closing the last window, and window menus behave as if the spare did not exist.
- [ ] The spare's measured memory and its idle CPU are in the handoff, with the before and after timings.
- [ ] The spare's decisions (adopt, refill, discard, fall back) are covered as plain functions beside the play-window tests.
- [ ] A changeset for the Mac app's behaviour, per docs/releases.md.

## Second review

Beside the standard review, ask an Opus reviewer (`model: anthropic/claude-opus-5-5:high`) to check one risk: that the spare window cannot weaken the control/render origin split or the single-use handoff (nothing minted early, nothing reusable, no control token reachable from frame code).

## Comments

### agent, 2026-11-12T18:05:13.900Z

Merged to main in 4d107b4e (task 619). Done: marks logged per play; window on screen 21 to 65 ms after the press from the spare (48 to 79 ms without), was 132 to 194 ms; the spare costs about 18 MB and no idle CPU; a second review (Opus high) found the origin split and single-use handoff hold, and its three nits are fixed. Review fixes after it: the spare refills only on a real reveal, close or load failure (no timer). Known deviation, decided in task 609: a canvas page older than the app (an adopted older daemon, or a remote on an older version) hands over no size, so the app asks for it but waits at most 150 ms, then shows at the fallback size and never moves it. Recording's reopen was not exercised by hand (unchanged code path).

Builder's handoff:

# t301 (spool#301): the Mac app's play window shows at once, from a warm spare

Branch `619-implement-spec-300-when-every-ticket-has--spec-619-t301`, 8 commits rebased onto spool#302's 8f6065e2:

```
197f617c player: mark when the shell paints and when the frame is revealed
6315432c desktop: log a play's four timing marks
4de07938 daemon: serve the mac app's spare play window an empty page
b3371454 daemon: serve the spare play window's page under player-assets
9b6e6cfb canvas: hand the mac app the frame's size with a press on play
16734dd5 desktop: show the play window at the press, from a warm spare
b616b3c0 changeset: the mac app's play window shows at once
9f0d4bb0 desktop: say how the play window shows at once
```

Then three fixes from the second review:

```
desktop: load the spare from the daemon's own origin
daemon: hold the spare play page to inline styles by policy
desktop: take a play and its marks only from the daemon's control origin
```

- `daemonOrigin` is kept beside `daemonOn`, and the spare loads `spareUrl(daemonOrigin)`.
- `/player-assets/spare` has the CSP `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'`. Its test in play-serve checks for that CSP.
- `spool:play` and `spool:play-window-mark` require the sender's main frame to be on the control origin of the daemon the window is on. Without a remote that is this Mac's daemon; with one it is `http://127.0.0.1:<remote.port>`, the tunnel, so a remote canvas's play still works.

Re-checked on the m1 after these fixes:
- a spare adoption and a fresh play both logged their marks;
- the spare page renders under the CSP (body background `rgb(14, 14, 14)`, strip 30px);
- the lane's app and daemon were quit afterwards.

After the rebase, the mark call sites are in the shell core (`src/runtime/player-shell.tsx`, `mountPlayerShell`). The core reaches the Mac window only through `host.desk`. The two marks still fire from the same two effects as before, so the m1 numbers below still hold.

No open questions.

## What I built

1. **Timing marks.** Each play in the Mac app logs one line in `app.log` once its frame is revealed (or with what it had, when the window closes first):
   `play  marks  <project>  <frame>  <spare|fresh> window-shown=Xms shell-painted=Yms frame-revealed=Zms`. All times are after the press, which is when the main process received it.
   - `press` and `window-shown` are taken in main (`desktop/src/play-timing.ts`: `playTiming`, `wallClock`, `isPlayMark`).
   - `shell-painted` and `frame-revealed` are taken by the page (`src/runtime/play-marks.ts`) after a paint (rAF, then a task). They are recorded as `performance.mark("spool-play:<mark>")` on the outer document's timeline and handed to the Mac window as wall-clock times through `window.spoolPlayWindow.mark(name, at)`.
2. **Show first.** No awaited request stands between the press and the window. The canvas hands over the frame's size it already has, through a new canvas-bridge call (`spoolCanvasWindow.play(path, {w, h})`, IPC `spool:play`, accepted only from the canvas window's main frame and only for a `/play/<project>` URL on the daemon). The window is placed (remembered rect, else fitted), titled, shown dark, and only then pointed at the play URL. The old wait (hidden until `ready-to-show`, or one second) is gone.
3. **Warm spare.** While spool's window is open on a daemon's canvas, one hidden play window waits on `GET /player-assets/spare`. It has the same origin, preload and webPreferences as a play window. Its page is the shell's dark plus the 30px `.spool-top.is-desk` strip, drawn by `playerChromeCss`, with no script and no token (`no-store`, `connection: close`, control origin only; the render host 404s it). A press adopts it: `setBounds`, `setTitle`, tracked in `played`, `show()`, then `loadURL(playUrl)`. The next spare is made 1 s after the last pending play window has revealed its frame (or after 10 s, or when it closes). The spare is dropped when:
   - the canvas closes or navigates (cross-document);
   - the daemon changes (pid or origin);
   - the window goes remote;
   - its page is refused (an older daemon; that daemon is then not asked again), fails, or its renderer dies.

   The fallback is "show first" with a window made for the press.
   - Spare rules as plain functions: `desktop/src/play-spare.ts` (`spareForPlay` → adopt/fresh/discard, `keepSpare`, `shouldMakeSpare`, `daemonIdentity`, `spareUrl`), tests in `play-spare.test.ts`.
   - Wiring: `desktop/src/main.ts` ("MARK: - The play window" with `showPlayWindow`/`makePlayWindow`, plus a new "MARK: - The spare play window" with `tendSpare`/`makeSpare`/`takeSpare`/`dropSpare`/`awaitReveal`/`revealed`).
   - While hidden the spare has `excludedFromShownWindowsMenu = true`. That is cleared on adoption.

## Interfaces other tickets use

- `src/runtime/play-marks.ts`: `type PlayMark = "press" | "window-shown" | "shell-painted" | "frame-revealed"`, `playMarkName(mark)` → `"spool-play:<mark>"`, `markPlayAfterPaint(mark, hand?)`. It is taken once per document; `hand(mark, wallClockMs)` gets it too. play-marks no longer reads `window` itself.
  - Call sites, in the core's `mountPlayerShell` (`src/runtime/player-shell.tsx`):
    - `useEffect(() => markPlayAfterPaint("shell-painted", host.desk?.mark), [])` in `Page`;
    - `useEffect(() => { if (revealed) markPlayAfterPaint("frame-revealed", host.desk?.mark) }, [revealed])` at the top of `Host`.

    So every host of the core (the live tab or window, and #304's export) puts the two on its document's timeline. Only a host with a desk hands them on.
  - **#303, for a tab:** read `performance.getEntriesByName("spool-play:shell-painted")` etc. on the played tab's document. `press` and `window-shown` there have to come from the canvas side (a different document), for example the canvas marking `spool-play:press` and passing its wall-clock time to the tab.
- `DeskWindow.mark?(mark, at)` (`src/runtime/player-page.ts`). `deskWindow()` includes it only when the bridge's `mark` is a function (test in `player-page.test.ts`). The live host's `desk` therefore carries it. The bridge member is `window.spoolPlayWindow.mark(name: string, at: number)`, an optional addition in `desktop/src/play-preload.ts`; `restored` and `reset` are unchanged.
- Canvas bridge: `DesktopWindow.play?(path, size)` in `src/ui/desktop-window.ts`. `playFrame` in `src/ui/canvas/canvas.tsx` uses it when present and the frame is known (rounded w/h); otherwise it falls back to `window.open` as before. A browser tab is untouched. **#303's warm-on-intent sits next to `playFrame`.**
- Daemon: `GET /player-assets/spare` (in `src/daemon/app.ts`, `playSpareDocument()`), test in `play-serve.test.ts`.

## Deviations, and why

- **Touched `src/ui` (canvas.tsx, desktop-window.ts).** The ticket's scope was desktop plus one daemon route, but the size has to come from something already in hand at the press, and only the canvas has it. I turned down two alternatives:
  - `window.open` features, which make play a popup in a tab;
  - a geometry cache in main, which goes stale when a frame is resized.

  A canvas page older than the bridge's `play` (an older daemon the app adopted, or a remote) still opens the URL as a popup. Main then asks the daemon for the size as before, but shows the window as soon as it has it, with no wait for paint.
- **Route at `/player-assets/spare`, not a new top-level path.** `src/app-paths.test.ts` forbids new first segments, because they would collide with team addresses. `/player-assets/*` is already control-only.
- **"A canvas is open"** means spool's window is open on a daemon's canvas page (Home included). It is not the page's `canvasActive`, which flips whenever a dialog opens.
- Two commits for the route: the second moved it from `/play-spare` to `/player-assets/spare`.

## Numbers (m1, lane `~/dev/scratch/play-619`, ports 7919/9619/9620, a two-frame project, presses through the real play button by CDP mouse events)

Before ran on a build with the marks only (today's behaviour). After ran on the branch. All values are ms after the press.

| case | window-shown | shell-painted | frame-revealed |
| --- | --- | --- | --- |
| before, phone ×4 | 191 194 184 167 | 154 150 143 154 | 222 207 206 169 |
| before, desk ×3 | 132 144 151 | 130 137 146 | 158 173 201 |
| before, phone edited 150 ms before the press ×3 | 136 133 143 | 127 119 134 | 180 166 184 |
| before, desk after a daemon restart ×2 | 137 157 | 134 148 | 171 189 |
| **after, spare, phone ×4** | 65 42 21 35 | 110 63 66 60 | 149 95 87 84 |
| **after, spare, desk ×6** | 23 24 37 43 40 56 | 57 60 72 66 62 70 | 80 82 102 93 103 109 |
| after, spare, phone edited before the press ×3 | 30 29 37 | 111 53 59 | 157 94 100 |
| after, no spare (fresh), desk ×3 | 67 63 73 | 149 152 156 | 170 171 181 |
| after, no spare (fresh), phone ×3 | 69 48 79 | 157 131 151 | 183 158 170 |

Before, the shell painted and the frame was revealed while the window was still hidden, so the window appeared only once both had happened.

- **On screen, from screen recordings at about 57 fps.** I recorded the screen, with a square on the canvas that turns red on pointerdown.
  - With the spare: the play window, with its lights and the bar's strip, is in the same captured frame as the canvas's own repaint of the press, so within about one frame. Three frames later the bar's text paints over the strip, with no flash between them. The frame's dissolve starts at about +100 ms.
  - Without a spare: the window is on screen dark about 50 ms (3 frames) after the press repaint, and the dissolve starts at about +158 ms.
  - The acceptance target of about 100 ms is met in both cases.
  - The spare also halves frame-revealed (about 200 ms down to about 95 ms), because the renderer process is already running.
  - The project here is small, so cold-compile cases are not represented. That is #303's.
- **Memory.** The spare's renderer has a footprint of 17 MB (RSS 85 MB, mostly shared pages). The whole lane app measured 390.5 MB with the spare and 372.3 MB without it, so the spare costs about 18 MB, not the estimated 100 MB.
- **Idle cost.** Over 60 s the spare renderer's CPU time stayed at 0.10 s, `top` showed 0 idle wakeups and power 0.0, and its renderer holds no sockets.
- **Checked on the m1:**
  - Remembered rect, `restored` and reset work on an adopted window: moved to 200,120 900x700, closed, played again → opened there with `restored: true` and the bar showing "restored reset"; reset put it back on 312,61 1200x830 and cleared `play-windows.json`.
  - Title is `desk · proj`.
  - The Window menu lists only `proj · spool` while a spare exists.
  - Closing the canvas window drops the spare (`spare dropped no canvas`); reopening the canvas makes a new one.
  - Killing the daemon drops the spare, and the new daemon's canvas gets a new one.
  - Quit with a spare and a play window open quits cleanly and stops the daemon (`quit stopped elapsed=71ms`).
- **Not done:** recording's reopen. It is a `location.replace` inside the same window and its code path is unchanged, so I didn't exercise it.

## Checks run

- `pnpm typecheck` and `pnpm check` (biome and design-lint) pass, as does `desktop/` `pnpm typecheck`.
- `pnpm test:changed` passed: 64 files, 528 tests. After the rebase onto 8f6065e2 it passed again with 529 tests.
- Also run, and passing: `play-tab-browser`, `player-parity-browser`, `play-serve`, `app-paths`, `desktop-bridge`, `frame-label`, `hotkey-dispatch`. After the rebase, `play-tab-browser`, `player-parity-browser`, `play-serve`, `player-runtime` and `player-page` passed again (103 tests).
- `desktop` `pnpm test`: 141 pass and 1 fail. The failure is `update-feed.test` ("the final ZIP, feed and blockmaps reconstruct…"), and it fails the same way without my changes. It is an environment test unrelated to this work.
- I did not run the full `pnpm test`; the orchestrator runs it when the branch lands.

## Notes for the reviewer and for follow-ups

- **Isolation.** The spare page has no script, token or handoff, and is served only on the control origin. A spare is only ever adopted for a play URL on its own origin and from the daemon that served it. The handoff is minted by the play URL's control request after adoption, exactly as for a fresh window. A spare's webContents is not in `played` until it is adopted, so `reset`, `restored` and `mark` from it are refused.
- **macOS window animation.** macOS still plays its own window-open zoom (about 100 ms, the window growing from slightly smaller), the same as before. Turning it off would need native `animationBehavior`, which Electron doesn't expose. A possible follow-up if "instant" should mean no zoom.
- **Spare after a crash or failed load.** A spare dropped this way is not remade until the next canvas event or play reveal. This is deliberate: no crash loop.
- **m1 lane.** The app and daemon are stopped. `~/dev/scratch/play-619` (1 GB) holds the harness for #303:
  - `build.sh`;
  - `launch.sh [app]`;
  - `play.mjs FRAME N [WAIT]`, with `TOUCH=1` to edit the frame first and `DROP=1` to destroy the spare first;
  - `cdp.mjs`, `strip.sh` (screen recording, run through `~/.agent-hub/m1/gui`), `mem.sh`, `checks.mjs`, `main-eval.mjs` (port 9620).

  Copies of the scripts and `frames.py` (the frame analysis) are in `/scratch/agent-tmp/pi-orch/spec-619/notes/spec619-t301-*`.

## Known deviation: the older canvas's popup path still waits, capped at 150 ms (a98353d8)

"No awaited request between the press and the window showing" holds on the normal path. A canvas served by this version's daemon hands the frame's size over with the press (`spoolCanvasWindow.play`), and nothing is asked before the window shows.

One path still asks the daemon, by decision: a canvas page older than the bridge's `play`. That page opens the play URL as a popup with no size. It is hit by:
- a canvas page served by a daemon older than this change and adopted by the newer app;
- a remote whose daemon is on an older version.

There, `openPlayFromPopup` asks `/api/p/:project/frames` with a 150 ms timeout (before this it was 2 s).
- An answer within the cap opens the window at that size.
- Otherwise the window shows at once at the unknown size: the rect remembered for it, else `UNKNOWN_AUTHORED` (1440×900) fitted. A later answer never moves it.
- The decision is `popupPlaySize` in `desktop/src/play-spare.ts`, tested in `play-spare.test.ts`.
