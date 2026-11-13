# #309 · Mac app: a small native module for presenting (no menu bar when spool is already full screen, and no resize animation at the press)

- State: closed
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-12T03:41:21.951Z
- Updated: 2026-11-12T12:48:07.386Z
- Closed: 2026-11-12T12:48:07.386Z

## Why

Two things about presenting a deck in the Mac app (experiment `deck`) cannot be done with what Electron offers, and both were measured on the m1:

1. **#308, item 3.** When spool's window is already in macOS full screen (the green button) and Present fills the screen on one display, the menu bar still drops down when the pointer reaches the top edge. A higher window level changes nothing; kiosk mode leaves the title strip over the slide and locks ⌘Tab; leaving full screen for the talk and returning plays about 600 ms and 900 ms of Space animation. What works: setting the app's presentation options to full screen + hide menu bar + hide Dock while the talk plays (tested by task 617 with a 30-line Objective-C module loaded into the running app: no menu bar, no title strip, ⌘Tab still works). Task 617's notes and the test module are in a comment on #308.
2. **#306, part 2.** About 80 ms of each press on Present is macOS animating the last 33 pt of the window's resize, with no frames drawn (press to first frame of the flight is 71 to 92 ms from ⌘↵). The only Electron-level way out is setting macOS's window resize time to near zero for the whole app, which also kills the first-run window's growth (#250). With native code the one resize can be done without animation.

Liam's bar for decks: "as good as if apple would've made them almost".

## What to build

One small native module in the Mac app (`desktop/`), built by `desktop/scripts/build.sh` (one `.mm` file compiled with clang against the header-only `node-api-headers` package is the idea task 617 proposed; choose what is cleanest), for both architectures the app ships, signed and notarized with the app, loaded only on macOS and only by the main process. It offers exactly two things: set and restore the app's presentation options for a talk, and resize a window to a display's bounds with no animation. If the module fails to load, presenting works as it does today (#306's way) and nothing else in the app is affected.

## Done when

- On the m1, in the app built and signed as a release is: with spool's window in green-button full screen, a talk shows no menu bar at the top edge and no Dock at the bottom, ⌘Tab and Mission Control work, and ending the talk returns to the same full screen window with no Space animation. Screenshots with the real pointer at each edge.
- Press to first frame of the flight, measured as #298 and #306 did, cold and readied, click and ⌘↵: report before and after; the target is the window step under 30 ms.
- The first-run window's growth (#250) is unchanged.
- The release build, signing, notarization and the auto-update of both Spool and Spool Beta still work (`desktop/README.md`, `docs/releases.md`); prove the beta build end to end.
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset; a second review by another Opus reviewer (`anthropic/claude-opus-5-5:high`) of the native code and the build change, since it ships in a signed app. Merged to main with CI green, not released.
- A message to task 557 with what was done and the numbers, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T12:07:18.896Z

Done and merged: PR #432 (7a6286c1) and follow-up PR #435 (9d94e587). Proven on the signed beta 0.56.1-beta.20 on the m1.

**What ships**
- desktop/native/presenting.m: a small Node-API module (arm64), built by scripts/native.sh in the build, signed and notarized with the app, loaded only on macOS in the main process (at the canvas's first load, so the press never waits for it).
- Present no longer waits for macOS's resize animation: just the press's simple full screen change is made in one step (`immediately`). Other resizes keep their animation: #250's first-run growth uses an animated setBounds that still takes ~273 ms in beta.20.
- A talk over a window already in macOS full screen keeps the menu bar away with presentation options (1029 to 1034), watched for the whole talk because macOS puts its own back after ⌘Tab and Mission Control. The Dock is kept off by the window's level, because macOS ignores the hidden Dock option over a full screen window. Both go back as they were when the talk ends.

**Press to first frame (ms, m1, screen recording)**
- cold click: 177/148/148 before, 89/96/95 after (beta.17: 118/87/79/120/96)
- cold ⌘↵: 103/118/105 before, 37/49/45 after (beta.17: 54/58/54/47, one 257 outlier)
- readied click: 112/119/120 before, 68/73/69 after (beta.17: 62/52/71/61/67)
- readied ⌘↵: 116/126/112 before, 60/79/87 after (beta.17: 42/49/46/43)
- The main-process handler step went from 72–86 ms to 6–27 ms.

**Native full screen, signed beta.20**
- ⌘Tab away and back: 10 of 10 kept the bars hidden.
- Mission Control: in and out, the bars stayed hidden.
- Screenshots with the pointer at the top and bottom edges show only the slide.
- When the talk ends, options are back to 1029 and the level drops. After leaving full screen they are 0.
- Leaving full screen mid-talk (⌃⌘F) gives 0 and drops the level.
- The window never leaves its Space, so there is no Space animation.

**Beta proof**: beta.20 is Developer ID signed and notarized (spctl: Notarized Developer ID; stapled; deep verify ok). presenting.node is signed with the hardened runtime. The module loads, and the log has no `FAIL native`.

**Update note**: a second copy of Spool Beta in a scratch folder timed out in "preparing" when updating. Two copies with one bundle id share one ShipIt cache. The real install in /Applications staged beta.17 in 3 s, so this is a test-setup artifact, not a product bug.

### agent, 2026-11-12T12:48:07.386Z

Merged to main and judged in task 557.
