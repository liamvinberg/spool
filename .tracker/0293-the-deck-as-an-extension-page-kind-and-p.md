# #293 · The deck as an extension: page kind and play mode

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #289, #290, #317
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:04.671Z
- Updated: 2026-11-12T12:02:21.275Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The deck moves whole into `extensions/deck/`, and works in the new window exactly as it does on main the day this ticket starts. It is the real proof of what #317 built with fixtures (page kind, play mode, the screens service), and of the corner, a kind steering motion, a slot owned by another extension, a verb option and the exports service.

- **Daemon part**: `deck.json`, the layout with its keeper and journal, the routes (`src/daemon/deck/routes.ts`, mounted in `app.ts`), the `--beat` option on `spool shot`, the agent guide topic and the check rules (`checkDecks`), the talk's HTML through the exports service. A **references participant** for the slide list: today that is two callbacks (`deckFollowsMoves` and `deckFollowsTrash` in `src/daemon/deck/change.ts`, called from `explorer-routes.ts`), and the participant adds what they lack, taking part in restore and copy too, under one undo. The deck's hooks elsewhere in the daemon come out with it: `projection.ts` (a slide's place), `events.ts` (hearing `deck.json` and notes change), `vendor.ts` (the stage's entry), and the keeper's wiring in `app.ts`.
- **Frame part**: `ui.beats` and `ui.live` with their fallbacks (`beats` reads as the last beat, `live` does nothing), the stage's side inside a slide's document (`src/runtime/deck/stage.tsx`, `slide-beats.ts`), and the deck's special cases in `src/runtime/frame-runtime.ts` (around 1796, 2130 and 2152), which become boot data.
- **Window part**:
  - **The deck page**: the band, the loose frames, the numbers; one line however long the talk, scrolling at the edges, with the 120 px floor on a slide's width, through the kind's `layout`.
  - **Dragging slides** (#299): the gap that opens like the Dock, on springs, the lift, no trading of slides and no labels while dragging. The deck keeps deciding where the gap is (`deck-drag.ts`: the lead, the reversal margin, the band's slack); core's motion draws it (the kind's `drag`).
  - **Going into a slide** (#305): through the play mode in the canvas, with no stutter: the picture stays until the slide has drawn, keys pressed during the flight are replayed, Esc returns the camera.
  - **Presenting** (#298, #306, #308, #309, #310): Present and "Present the other way"; on one display the way last used (full screen, or the presenter view); with two displays the presenter view here and the room there, and full screen chosen from the caret still opens the room; the flight into full screen and back; the bar at the foot, the notes, black, the keys sheet; the presenter view and the room, with the pointer's dot and Show pointer in the room's menu (#315). Filling the screen and the room's window go through the screens service.
  - **Present in the corner** (#312): the anchor seat of the top right row, with its caret.
  - The rows in Pages through `spool.pages:rows`, the notes and the talk's size in Properties through `spool.properties:section`, New presentation, the export entries (the PDF is captured in the window, the HTML built by the daemon).
- **Settings** move to the manifest with their keys and stored values unchanged: `present.way`, `export.talk`, and the pointer setting #315 adds. Someone's remembered way of presenting must survive the move.
- **Today's window** is repointed where routes moved. A window module that needs nothing but its arguments moves once into the extension and today's window imports it from there (the spec's lint allowance for today's tree); what cannot be shared is written for the SDK and listed in the handoff with its twin's path, so a fix knows to go to both.
- The deck's tests move with the code.
- The experiment `deck` keeps deciding whether the deck exists, in both windows, until it graduates.

## Decided

- **The baseline is main, not 0.55.** Behaviour is spec #265 with everything shipped since: its fixes (#277, #278, #281, #283), #298, #299, #305, #306, #308, #309, #310, #312, #315, and whatever the presentations thread (task 557) has landed by the day this starts. Before building, read `git log` over `src/deck`, `src/ui/deck`, `src/daemon/deck`, `src/runtime/deck` and `desktop/src` since 2026-11-12 and add what is new to the list above. Nothing about the deck changes here. A difference found on the way is brought to task 557, not fixed in passing.
- The Mac app's main process is core (#317): after this ticket it knows "a play mode's window", never "a room".
- The stage engine stays one engine in three hosts; lifting it into the play mode slot is a move. The room still sees only a live slide's `ui.state`.
- The flicker rules of #283 hold in the new window; `src/daemon/deck-flicker-browser.test.ts` runs against both.

## Where to start

`~/.brain-archive/core-spec/refresh/scout-deck.md`: an inventory of the deck on main at 0.56.0, capability by capability, with every call site outside the deck's own folders (the list of what has to come out of `canvas.tsx`, `app.ts`, `frame-runtime.ts`, `sidebar.tsx`, `properties-rail.tsx`, `history.ts` and `desktop/`). Then `src/deck/`, `src/daemon/deck/`, `src/ui/deck/`, `src/runtime/deck/`, `src/runtime/deck-stage-host.ts`, `skill/topics/deck.md` (its line on presenting is out of date: it still says Present always opens the presenter view; fix it as it moves), `desktop/src/room.ts`. Ticket #265 is the deck's spec.

The suites that move or must pass against both windows:

- functions: `src/deck/` (`changes`, `deck-file`, `layout`, `notes`, `present-wire`, `stage-keys`, `stage-session`, `stage-wire`, `talk-reload`), `src/ui/deck/` (`deck-api`, `deck-drag`, `deck-motion`, `inside-camera`, `present-flight`, `present-hand`, `present-way`, `present`, `settle`, `spring`, `talk-export`), `src/runtime/deck/` (`stage`, `stage-host`, `stage-warm`), `src/daemon/deck/` (`deck`, `journal`, `slide-source`);
- browser: `src/daemon/deck/` (`stage-browser`, `present-browser`, `present-slides-browser`, `talk-file-browser`), `src/daemon/deck-canvas-browser.test.ts`, `deck-flicker-browser.test.ts`, `deck-talk-export-browser.test.ts`;
- the Mac app: `desktop/src/` (`room-window`, `presenting`, `window-manager`);
- shared: the corner's case in `src/daemon/presence-browser.test.ts` (around line 620), `src/ui/canvas/corner-row.test.ts`.

## Second review

Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) reads this for the presenting path (the authority, the room, the two windows in the Mac app, and everything put back when a talk ends, when the deck is switched off mid-talk, and when a display is unplugged) and for flicker.

## Done when

- No deck code is left in core: the lint holds, and the camera, the canvas's store, mounting, the picture layer, the frame's shell and the Mac app's main process name kinds, modes and motion, never the deck.
- Every suite above passes against the new window and, unchanged, against today's; added to the parity list.
- With the deck off: a deck page shows as an ordinary page, `deck.json` and the notes are untouched, frames calling `ui.beats` render their last beat. Switched off in the middle of a talk: the talk ends and the screen is put back.
- A remembered `present.way` set before this ticket is still honoured after it.
- On the m1, in the Mac app with the new window: a talk presented both ways on one display, then with a second display (the virtual display tool is in `~/.brain-archive/release-run/`), from green-button full screen (no menu bar at the top edge), and with AeroSpace running. Press to first frame of the flight, measured as #306 and #309 did, is not slower than today's window. Screenshots and the numbers in the handoff. Put a time limit on every command that could wait for input.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.
