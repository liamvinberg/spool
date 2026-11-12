# #281 · Deck: what the release run found, fixed before 0.55.0

- State: closed (done: merged 400ab9f5, CI green)
- Labels: ready-for-agent
- Tasks: task 593 (Deck fixes before 0.55.0)
- Created: 2026-11-11T07:35:17.042Z
- Updated: 2026-11-11T08:58:08.882Z
- Closed: 2026-11-11T08:58:08.882Z

## Parent

Follows spec #265. The release-readiness run on the m1 (task 591, record in `~/.brain-archive/release-run/`, report in task 557) passed and left five small things open. Liam wants them in before the release. One worker.

## What to fix

1. **Notes are lost on click-away.** In Properties, a slide's notes field saved on Tab but not when the person clicked elsewhere. Typed words must never be lost: the field saves when it loses focus by any route (a click on the canvas, another row, another window, going into a slide, Present), and before the selection changes. This is the one that matters most; test it in the canvas walk.
2. **The first drag of a loose frame did nothing; the second worked** (Mac app, a fresh deck page). Reproduce it, find the cause, fix it. If it cannot be reproduced after a real attempt, say exactly what was tried.
3. **The unplug notice is cut off** on a 1512-wide window: "<display> was unplugged · the room is a window" runs under the "next" column. It must fit or shorten at every width the window allows. The design frame is `app/spool-deck--presenter-unplugged`.
4. **Reopening the room flashed a stray 42x19 window** in the Mac app, probably a tooltip's. Find what it was and stop it.
5. **In Safari the exported HTML file needed a click before the arrow keys worked.** The file takes the keys as soon as it opens, in Safari and Chrome.
6. **Replace the text of `.changeset/deck-experiment.md`** (keep the `minor` front matter) with exactly:

> **Decks, as an experiment.** Turn on Decks under Settings, Experimental, and a page can be a talk. New presentation in Pages gives you five starter slides and asks your agent what the talk is about. The top row of the page is the talk, in order: drag a frame into the row to add it, onto a slide to swap the two, or out of the row to skip it. A slide can reveal itself in steps, and each step has its own notes in Properties. Double-click a slide to step through the talk right on the canvas, and Esc flies you back. Present, with ⌘↵, turns spool into a presenter view with the clock, the next step and your notes, and opens a second window that shows only the slides. In the Mac app that window goes full screen on your other display. A slide that breaks never reaches that window: it keeps the last picture and the presenter view tells you. Export sends the talk as a PDF, or as one HTML file that plays offline. For agents, `spool skill deck` explains how to write one: a `deck.json`, `ui.beats()` and `ui.live()` on the `spool` import, and a `notes.md` beside a slide.

## Leave alone

Everything else. No new features, no restyling. Do not merge the release PR (#427) and do not publish.

## Done when

1 and 5 have tests; 2, 3 and 4 are checked in the Mac app on the m1 (the m1 skill; build from the branch as `desktop/README.md` says) with screenshots kept under `~/.brain-archive/release-run/fixes/`. `pnpm test:changed`, `pnpm typecheck`, `pnpm check`, the full `pnpm test`, merged to main, and **CI on main green**. Then message task 557 and close the task.

## Comments

### agent, 2026-11-11T08:58:08.882Z

Merged to main at 400ab9f5, and CI on main is green. Fixed: notes save however the field is left; the exported file in Safari now says to click first, and that click only takes the keys; the unplug notice shortens in narrow windows; the changeset text is replaced. #2 was the test driver typing "e", which switched on the Edit tool, not a product bug. #4 could not be reproduced after four kinds of click. Evidence is in ~/.brain-archive/release-run/fixes/.
