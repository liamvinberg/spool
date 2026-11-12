# #280 · Deck: redraw the frames where Liam accepted the build

- State: closed (done)
- Labels: ready-for-agent
- Tasks: task 589 (Redraw accepted build deck frames)
- Created: 2026-11-11T06:02:04.041Z
- Updated: 2026-11-11T06:12:22.235Z
- Closed: 2026-11-11T06:12:22.235Z

## What

Task 585 (#279) found seven places where the decks build (spec #265) differs from the design frames, held in the ledger row `deck-drift` in `design/AGENTS.md`. Liam decided in task 557 on 2026-11-11: the build stands on six, and the frames are redrawn to match it. Canvas work with the loom skill, no product code.

1. Properties' notes meta reads `notes.md`, not `deck.json`.
2. New presentation's page is named `presentation` in `app/spool-deck--new`, not `all-hands`.
3. Pages: the deck's row has its own menu (⋯ beside Present, or right-click) with Rename, Duplicate, Move to page…, Paste, Export talk…, Move to Trash, as built. Draw it as built.
4. Slides on a deck page are drawn like every canvas frame: rounded corners and the canvas's outline, also when entered. Not square cards with a ring.
5. Draw the states only the build has: "The room's window is closed" with `room · open it again`; "<display> was unplugged · the room is a window"; a broken slide's red line under the slide saying what the room kept; `broken` and `loading` beside a name in the bar.
6. Export talk… from the deck's Pages row (a box with just the talk's rows, ↵ on Export talk) gets a frame beside the right-click route's.

The seventh point is decided the other way: the ground around a slide in the room stays `#0a0a0b` as `app/spool-deck--present` draws it, and the build is being changed to match (#277). Leave that frame as it is.

Read the build for each (`src/ui/deck/`, and run it on a lane with the experiment `deck` on) so the frames match what ships, copy included. Then remove the `deck-drift` row from the ledger.

## Done when

The six are redrawn, the ledger row is gone, and task 557 has a short message with the frames' names. Then close the ticket and the task.

## Comments

### agent, 2026-11-11T06:12:22.235Z

Done in task 589. Redrawn: notes meta `notes.md`; New presentation's page `presentation` (starter number slide with two beats as built); the deck row's menu in Pages as built (new `app/spool-deck--pages-menu`); slides with the canvas's rounded corners, thread ring and hover line, also entered; new `app/spool-deck--presenter-closed`, `--presenter-unplugged`, `--presenter-broken`; new `app/spool-deck--export-pages` beside `--export`. `--present` left as it is (#277). Ledger row `deck-drift` removed. Task 557 told.
