# #293 · The deck as an extension: page kind and play mode

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #289, #290, #283
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:04.671Z
- Updated: 2026-11-11T10:15:04.671Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The deck moves whole into `extensions/deck/`, and works in the new window exactly as it does in 0.55. It is the proof of the slots nothing else uses yet: page kind, play mode, a slot owned by another extension, a verb option, the exports service.

- **Core gains** the **page kind** slot (a kind's layout, its `policy` over guides, gap snapping and handles, its `drag` deciding a drop in place of free movement, its template) and the **play mode** slot (a stage hosted by core in the canvas, in a play window and in the windows the mode declares, one authority publishing numbered snapshots, the others following), and the Mac app's part of opening a mode's windows.
- **Daemon part**: `deck.json`, the layout and its keeper and journal, the routes, a references participant for the slide list, the `--beat` option on `spool shot`, the agent guide topic and check rules, the talk's PDF and HTML through the exports service.
- **Frame part**: `ui.beats` and `ui.live`, with their fallbacks (`beats` reads as the last beat).
- **Window part**: the deck page (band, loose frames, the drag rules), going into a slide, presenting (the presenter view and the room), the rows in Pages through `spool.pages:rows`, the notes section through `spool.properties:section`, New presentation, the export entries.
- Today's window is repointed where routes moved and otherwise untouched. The deck's tests move with the code.
- The experiment `deck` keeps deciding whether the deck is on, in both windows, until it graduates.

## Decided

- Behaviour is spec #265 as shipped, with its fixes (#277, #278, #281, #283). Nothing about the deck changes here. A difference found on the way is brought to task 557, not fixed in passing.
- The stage engine stays one engine in three hosts; lifting it into the play mode slot is a move. The room still sees only a live slide's `ui.state`.
- The flicker rules of #283 hold in the new window; its captured-frame suite runs against both.

## Where to start

`src/deck/`, `src/daemon/deck/`, `src/ui/deck/`, `src/runtime/deck/`, `src/runtime/deck-stage-host.ts`, `skill/topics/deck.md`, `desktop/src/room.ts`. Tests: `src/daemon/deck/stage-browser.test.ts`, `present-browser.test.ts`, `src/daemon/deck-canvas-browser.test.ts`, and the suite #283 added. Ticket #265 is the deck's spec.

## Second review

Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) reads this for the presenting path (the authority, the room, the two windows in the Mac app) and for flicker.

## Done when

- No deck code is left in core beyond the two generic slots; the lint holds.
- Every deck suite passes against the new window and, unchanged, against today's; added to the parity list.
- With the deck off: a deck page shows as an ordinary page, `deck.json` and the notes are untouched, frames calling `ui.beats` render their last beat.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.
