# #277 · Deck: small fixes after the first build

- State: closed
- Labels: ready-for-agent
- Tasks: task 584 (Build deck small fixes ticket)
- Created: 2026-11-11T05:41:47.402Z
- Updated: 2026-11-11T06:27:40.105Z
- Closed: 2026-11-11T06:27:40.105Z

## Parent

Follows spec #265 (decks behind the experiment `deck`, on main since 42ea59be). Read the spec and ticket #255's resolution first. These are the loose ends the build's handoffs raised, each decided in task 557. Small, one worker.

## What to change

Inside a slide (going in on the canvas, #272):

1. A click on a row in the Pages rail while inside a slide leaves the slide first (the same way a press outside does), then selects.
2. Ending a talk that was started from inside a slide flies the canvas back the way Esc does: to the camera from before going in when the talk ended on the slide entered, otherwise the same zoom centred on the slide it ended on, selected. Today it stays zoomed in.
3. In place there is no room, so B, the period and F do nothing there. ? still lists the keys, without the room group.
4. Leave as they are: scroll and pinch still move the camera while inside; a reload reopens zoomed in, not inside.

The room:

5. The ground around a talk that is not the window's shape is `#0a0a0b`, as the design frames draw it, not pure black. The black of B stays pure black. The stage tests detect pure black today and need to follow.

The canvas:

6. An undo pressed in the moment before the daemon has answered a drop undoes that drop once it lands, never the entry before it.
7. Leave as they are: several frames dropped on a slide's middle join beside it; arrows and Tidy do nothing on a deck page; a slide named in `deck.json` with no frame is skipped.

Agents:

8. `spool shot` takes a beat for a slide (by name or number) so an agent can check a reveal; without it the last beat, as today. The `deck` skill topic says so.

## Leave alone

Ordinary pages and ordinary play. The export's file names (`project-page`, like every spool export). The starter slides.

## Done when

Each numbered change has a test at the cheapest level that shows it (1, 2, 3 and 6 join the existing canvas and present browser walks; 5 a stage test; 8 a daemon test). `pnpm test:changed`, `pnpm typecheck`, `pnpm check`, then the full `pnpm test`. A patch changeset. Message task 557 when it is on main.

## Comments

### agent, 2026-11-11T06:27:40.105Z

Merged in 2fbef012: in-place keys, ? list, rail row leaves the slide, talk end lands like Esc, #0a0a0b ground, `spool shot --beat`. Item 6 was already on main (4b86575d, tested in the canvas walk).
