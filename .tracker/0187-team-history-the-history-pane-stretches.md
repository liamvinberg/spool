# #187 · Team history: the History pane, stretches and the moved-in line

- State: closed (done)
- Labels: ready-for-agent
- Parent: #114
- Blocked by: #186
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:44.622Z
- Updated: 2026-10-21T21:31:44.392Z
- Closed: 2026-10-21T21:31:44.392Z

## Parent

Spec: team history, restore and backups (#114)

## What to build

The History pane on the Mac canvas, read-only, as prototyped in #105 (`explore/cloud/history`, `history-paced` and `--project`). History is a pane beside Properties and Agent on team projects only (⇧⌘H), opened for a frame from its right-click (History…) and for the project from the project tab's menu; its head names the scope, × widens a frame's to the project's, and an Everyone / one-person pick filters it. Rows are days, then stretches (one person's run of saves on one machine with no 10-minute gap), grouped in the sync object on read and paged by day: end time on the left, a mark in the person's colour as tall as the stretch ran, who, how long, what it touched and the save count; spacing grows with the quiet (square root, capped) and a long gap says "50 min quiet". A frame's history includes saves to shared files it imports, marked "through order-button.tsx" (the daemon names the paths). A stretch with set-aside saves says "1 set aside" and, opened, names whose save arrived first. Picking a stretch folds it open to its files. The pane ends with "Saves are kept 90 days. Today's files are always kept." and the moved-in line: the sync object keeps the move-in record (when, by whom, commit) in its meta apart from the saves, the daemon reports the commit once git takes the move commit, and a project moved in before this shows the line without a commit. Motion as drawn, off under reduced motion. Spans spool-cloud (stretches route, move-in record) and spool (daemon, pane, menus, hotkey, design/frames/app mirror).

## Acceptance criteria

- [ ] 2,000 saves in a day from three people read as one row per stretch, newest first, grouped by day
- [ ] Two people saving at once make two interleaved stretches, never one
- [ ] The person filter shows only that person's stretches, folding the others away
- [ ] A frame's history shows its own saves and those to its imported shared files, the latter marked "through <file>"; nothing else
- [ ] Set-aside saves show on their stretch and inside it name whose save stood
- [ ] The moved-in line shows day, person and commit for a project moved in after this ships, day and person for one moved in before
- [ ] The pane docks, tabs and closes like the other panes, appears only on team projects, and ⇧⌘H is in the hotkey register and sheet
- [ ] Worker tests cover stretch grouping and paging; a browser test opens a frame's and the project's history
- [ ] `design/frames/app/` gains the shipped pane (not committed: the canvas is out of git)

## Blocked by

- #186

## Comments

### agent, 2026-10-21T21:31:44.392Z

Built and merged in spool-cloud `6a89dc4` (merge 205 #114 team history, restore, 90-day purge, r2 backups and restore from a backup) and spool `68300b03` (merge 205 #114 team history: spool history, the history pane, restore and undo, compare with now). Cloud: /history/stretches (grouped by day in the asker's time zone, filtered by person and path) and /history/stretch (each file, with set-aside saves naming whose save stood); the moved-in line is kept in meta; PUT /history/moved-in. Spool: the History pane on team projects (⇧⌘H, a frame's right-click, the tab menu), "through <file>" for imported shared files, set-aside chips, the 90-day footer and the moved-in line; the move commit is reported and retried at start. Changeset: minor. Not done: the pane doesn't outline frames on hover in the project scope (it does in a frame's scope, via #189), and the design/frames/app/ mirror of the shipped pane is left for a designer, since the design canvas is read-only for agents.
