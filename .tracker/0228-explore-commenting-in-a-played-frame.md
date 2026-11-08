# #228 · Explore: commenting in a played frame

- State: closed (picked: pause, toggled, one count; adopted into app/)
- Labels: enhancement, wayfinder:prototype
- Parent: #227
- Tasks: task 480 (Explore played-frame commenting designs)
- Created: 2026-11-07T10:32:02.885Z
- Updated: 2026-11-07T18:48:42.317Z
- Closed: 2026-11-07T18:48:42.317Z

Loom exploration, 4 designers, on spool's design canvas (`explore/player-comments/`). Cata picks.

Three moments: turning comment mode on from the player's bar (and with C, as on the canvas); placing a pin on the live screen, which is also clickable; seeing existing pins while walking from screen to screen. Both on the Mac player and spool.page's viewer player (a client on a share comments there).

Today the viewer's player (`src/ui/viewer/viewer-player.tsx`) has no comments; pins and the composer exist on the canvas (`viewer-comments.tsx`, `canvas/comments-layer`). Decision 18 of #227.

## Comments

### agent, 2026-11-07T11:21:35.199Z

Round 1 up on `explore/player-comments/` (task 480): tally, seeds, pause, anchor, signposts, inbox, margin, reel, each with a `--viewer` state. Waiting on Cata's pick.

### agent, 2026-11-07T18:48:42.317Z

Adopted into `app/spool-player--comments` and `app/spool-viewer--player-comments`; build note on #229.
