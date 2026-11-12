# #279 · Deck: bring the team canvas in step with what was built

- State: closed (done)
- Labels: ready-for-agent
- Tasks: task 585 (Sync deck canvas with build)
- Created: 2026-11-11T05:41:47.424Z
- Updated: 2026-11-11T05:56:14.526Z
- Closed: 2026-11-11T05:56:14.526Z

## What

Decks are on main (spec #265, 42ea59be). No builder was allowed to touch the team canvas while #243 was open, so `design/` is behind the code. The repo's rule: `design/frames/app/` mirrors what ships.

- Run `pnpm design:sync` so the canvas has the new `--motion-deck-*` theme roles.
- Redraw `app/spool-deck--presenter`'s head as built: ghost buttons, and the Mac window's top-strip padding so the clock clears the window's lights (the build's fix `ff9a16fc`; see `~/.brain-archive/spec-575-handoffs/t273/59-presenter-head-fixed.png`).
- Add frames for two things that were built without one: the "talk" row in the export menu (pdf | html), and the room's window (frameless, the slide only, the one-display window beside the presenter view).
- Check the other `app/spool-deck*` frames against the build and list any place where the build differs from the frame. Do not change the build and do not restyle: where they differ, say which looks right and bring it to task 557.

Use the loom skill. Designer work on the canvas, no product code. Reports to task 557.

## Comments

### agent, 2026-11-11T05:56:14.526Z

Done in task 585. Synced the theme (`--motion-deck-*`). Redrew the presenter's head as built: ghost buttons, the Mac lights, the clock cleared. New frames: `app/spool-deck--export` (the talk's pdf | html row in Export…) and `app/spool-deck--room-window` (the frameless room beside spool's window on one display). Seven places where build and frames differ went to task 557 with which looks right, and they are held in design/AGENTS.md as `deck-drift`.
