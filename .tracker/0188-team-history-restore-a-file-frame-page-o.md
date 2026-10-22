# #188 · Team history: restore a file, frame, page or project, and undo it

- State: closed (done)
- Labels: ready-for-agent
- Parent: #114
- Blocked by: #187
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:44.651Z
- Updated: 2026-10-21T21:31:44.398Z
- Closed: 2026-10-21T21:31:44.398Z

## Parent

Spec: team history, restore and backups (#114)

## What to build

Restore, as prototyped in #105 (`history-paced--open` and `--restored`). In an open stretch, Restore… puts back to the stretch's end: from a frame's history that frame, from the project's a choice of each frame and page the stretch touched and the whole project, each with its file count; a file restores from its line (Restore on hover). Restoring a frame that imports a shared file changed since offers it as a checkbox, off by default, naming the other frames using it. One question asks first and says the restore reaches the team as new saves and can be undone. The daemon writes the target's files as they stood (deleted files back, files created since removed) and sends one `saves` bundle carrying a restore reference (what, to which version). The sync object checks each save's hash against the path's hash at that version, refuses a mismatch, counts a checked restore against no fair-use limit, applies each save on its own base under the collision rule, and records it so the history shows it as its own row, ↺ "restore", naming what went back to when. A toast says it's done with Undo (⌘Z); the row has Undo this restore; both restore the same paths to the version just before. A set-aside save opened in history offers Put back, a file restore to that save's content. Motion as drawn. Spans spool (protocol, daemon, pane, canvas) and spool-cloud (object check, exemption, restore rows, dependency bump; cloud deploys first).

## Acceptance criteria

- [ ] Restoring a file, a frame, a page and the whole project each leave exactly the target as it stood at the moment, on every editor's disk and canvas
- [ ] A file deleted since comes back; a file created since inside the target goes
- [ ] A teammate's save landing between the moment and the restore makes that path's restore save set aside, like any collision
- [ ] A restore of 5,000 files neither takes from the minute's bucket nor counts in the month; a bundle claiming a restore with a wrong hash is refused
- [ ] The shared-file checkbox is off by default and names the other frames; ticked, the shared file goes back too
- [ ] Undo from the toast and from the row each put the paths back to just before the restore, and are restores themselves
- [ ] Viewers have no Restore anywhere; the object refuses their saves as today
- [ ] Put back from a set-aside entry in history makes that save's content the team's version
- [ ] Worker tests cover the check and the exemption; harness and browser tests cover the pane's flow; one team e2e restores a frame between two daemons

## Blocked by

- #187

## Comments

### agent, 2026-10-21T21:31:44.398Z

Built and merged in spool-cloud `6a89dc4` (merge 205 #114 team history, restore, 90-day purge, r2 backups and restore from a backup) and spool `68300b03` (merge 205 #114 team history: spool history, the history pane, restore and undo, compare with now). Cloud: each restore save's hash is checked against the version it names (a mismatch is refused with restore_mismatch); restores are exempt from the minute bucket and the month; every restore is its own stretch. Spool: RestoreRef on the saves bundle; Restore… for a file, frame, page or the whole project; the shared-file checkbox, off by default; Undo from the toast, ⌘Z and the row; Put back. Viewers: they can't open a team project's canvas on a Mac (NotAnEditor), so they never see Restore, and the cloud refuses their saves as before. Changeset: minor. Not done: after a restore_mismatch, a frame, page or project restore retries like an ordinary save rather than resending the exact bytes; design/frames/app/ mirror left.
