# #317 · New window: page kinds, play modes and the screens service

- State: closed (superseded by the ground-up rebuild, map #333)
- Parent: #284
- Blocked by: #288, #289
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-12T11:59:30.354Z
- Updated: 2026-11-13T14:47:31.307Z
- Closed: 2026-11-13T14:47:31.307Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The core half of what the deck needs, proven with fixtures before the deck itself moves (#293): a page can be of a **kind**, a kind can be **played**, and playing can take over a **screen**.

This was split out of the deck's ticket on 2026-11-12. After the spec was written the deck grew a lot (0.56 and after: #298, #299, #305, #306, #308, #309, #310), and one ticket could no longer hold both the new slots and the move. The deck is not touched here: it stays in today's tree and keeps working in today's window.

Read the spec's "Slots in this spec" (page kind, play mode) and "Services in this spec" (Motion, Screens, Session, Frames at run time). In short:

- **The page kind slot.** A kind says when a page is one (`when(page)`, from the page's folder), and brings:
  - `layout`: where the kind puts the page's frames, and how the page fits the window when it opens or a frame on it is revealed. This is what lets `camera.ts` know no kind (the surface ticket moved the deck's `fitBand` out of it).
  - `policy`: switches core behaviour on that page: guides, gap snapping, resize handles, Tidy and the arrows' nudge, and holding back the mounting a selection would cause until the hand is still. The last one is what keeps a slide from booting between the two clicks of a double-click (#305: `deckSlides` in `canvas-store.ts`, `selectionTargetsOf(..., settling)` in `lifecycle.ts`).
  - `drag`: takes a drag over in place of free movement. It never moves a frame itself: it is handed the press, each move and the drop, and steers core's motion (the service from the editing ticket), saying where each frame should be drawn and which is lifted. Core animates, lands the drop through the kind's own change, keeps the frames drawn where they landed until the daemon agrees, and travels back on a refusal. A sketch, to be made exact by the fixture: `drag: { start(held, at), move(at), drop(at): Promise<landed>, cancel() }` with a `motion` handle scoped to the page.
  - `template` (what a new page of the kind starts with) and `play` (the name of its play mode).
- **The play mode slot.** What plays when a page of a kind is played or a frame on it is gone into:
  - One stage that core can host in three places: in the canvas in place of the frame gone into, in a play window, and in the windows the mode declares. One authority publishes numbered snapshots; the others follow.
  - Core shows the frame's picture until the stage says it has drawn the step it is on, and starts the stage only when the camera has landed on its last drawn frame; keys pressed during the flight are kept and replayed (`deck-inside.tsx` 288 to 335 is the behaviour to match).
  - Core warms a stage ahead of a press only while no frame is in the hand and the camera is at rest (`canvas.tsx` 1984 to 2001), and lets it go when the selection moves on.
  - The stage owns keys through the input function from the surface ticket. Holding the keys and filling the screen are two separate facts (they were one until #298).
  - Leaving returns the camera to where it was (the rule in `src/ui/deck/inside-camera.ts`, which is the deck's today and becomes the slot's).
- **The screens service** (window side, asked for by a play mode):
  - which displays there are, by name where spool knows it;
  - fill a display: full screen over the Dock and the menu bar, also when spool's window is already in green-button full screen, with no resize animation at the press, and everything put back at the end;
  - place a mode's window on a display: shown only once it has drawn and its placement has settled (so it never opens black or on the wrong display), swapped to the other display on request, brought home when a display is unplugged, closed without a Space animation;
  - all of it released when the mode ends, when its extension stops, and when spool's window closes.
  - In a browser the same service uses the browser's full screen and a popup, with their limits (a browser will not open a popup and go full screen on one click: today the next click fills the page, `src/ui/deck/present.ts`).

Prove the three with a fixture kind and a fixture mode that live with the tests: a page of the kind lays out, its drag steers motion and lands, going in shows the fixture's stage, playing fills the screen and opens a second window.

## Decided

- **The Mac app's main process is core.** An extension has four parts and none of them runs there. The deck's Mac work is already mechanism that knows little about talks: `desktop/src/main.ts` (`presentFullScreen` at 228, `presentLevel` at 310, the display and full screen IPC at 1405), `room.ts` (opening, placing, the drawn-and-settled handshake, swap, a lost display), `presenting.ts` with the native module `desktop/native/presenting.m` (#309: presentation options and a resize without animation, loaded only on macOS, failing soft), `window-manager.ts` (#310: AeroSpace). That code stays where it is and stays one implementation serving both windows. What changes is its face: the preload API (`desktop/src/canvas-preload.ts` 84 to 95, typed in `src/ui/desktop-window.ts` 65 to 78) is talk-named today (`onRoom`, `swapRoom`, `showRoom`, `presentFullScreen`), and the SDK's screens service is not. Rename a channel only where its name would be wrong in the SDK; do not rewrite what works.
- **A play mode's window is recognised by core's rule**, not by the deck's URL (`desktop/src/room-window.ts` recognises a room's URL today). The mode declares its windows in its manifest; the main process opens only those.
- **No new native code, no new architecture.** The app ships for Apple silicon only (`desktop/electron-builder.yml`).
- Turned down: a fifth part for the Mac app's main process (the most trusted place spool has; an extension asks core, it does not run there). A mode animating its own windows (the black openings and Space slides of #306 and #308 came from exactly that).

## Where to start

`~/.brain-archive/core-spec/refresh/scout-deck.md` is an inventory of the deck on main with paths and line numbers; its "Electron/native/display manager" part is this ticket's map. Then `src/ui/deck/deck-page.tsx` (how a kind's drag calls the springs today), `deck-inside.tsx`, `present.ts`, `present-way.ts`, `src/runtime/deck/stage-host.ts`, `src/runtime/deck-stage-host.ts`, `src/deck/present-wire.ts` and `stage-session.ts` (the authority and its numbered snapshots), and the `desktop/` files above with their tests (`desktop/src/room-window.test.ts`, `presenting.test.ts`, `window-manager.test.ts`). Tickets #298, #306, #308, #309 and #310 say what each piece of the Mac work is for and how it was measured.

## Leave alone

The deck (`src/deck/`, `src/ui/deck/`, `src/daemon/deck/`, `src/runtime/deck/`): it moves in #293. Today's window beyond the preload API's names. How presenting looks and feels.

## Second review

Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) reads this for what is left behind when something ends badly: a display still filled, the menu bar or Dock still hidden, a second window left open or left clear, an AeroSpace hold never released, a window not returned to its size, when the mode throws, its extension is switched off mid-play, a display is unplugged, or spool's window closes. And for the security line: only a window a manifest declares is opened, and nothing from a project reaches the main process.

## Done when

- The fixture kind and mode are proven through the test kit and in one browser walk: layout and fit, a drag that steers motion and lands with one undo, going in with no blank and no picture swapped back (the captured-frame test), playing with the screen filled and a second window following the authority.
- Each ending in the second review's list is a test, at the cheapest level that shows it (`desktop/src/*.test.ts` are functions over a mocked Electron).
- `camera.ts`, `canvas-store.ts`, `lifecycle.ts` and the new window's tree name no kind and no mode.
- The deck in today's window still presents as before, since this ticket touches the path it runs on: every deck suite passes unchanged, and on the m1, in a Mac app built from this branch, a talk presented full screen, then with the room on a second display (the virtual display tool is in `~/.brain-archive/release-run/`), then ended, leaves the screen as it found it. Screenshots in the handoff. Put a time limit on every command that could wait for input.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.

## Comments

### agent, 2026-11-13T14:47:31.307Z

Superseded on 2026-11-13: Liam decided to rebuild spool from the ground up in a new repo (task 634), so the new window is not built beside today's in this repo. The foundation is being decided on the map #333, and this page stays as evidence for its tickets (above all #350, the extension system on the new foundation). Nothing here was built.
