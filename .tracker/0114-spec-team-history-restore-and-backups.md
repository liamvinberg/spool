# #114 · Spec: team history, restore and backups

- State: open
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.474Z
- Updated: 2026-10-21T16:50:44.722Z

## Problem Statement

A team project's `design/` left git, so nothing a team does to it can be undone. Every save already reaches the sync object with who made it, from which machine and when, but nobody can read that log: a member who wants to see what changed this morning, an agent asked to bring back yesterday's version of a frame, or an editor whose frame a teammate's agent wrecked has no way back. The log also grows for ever, set-aside saves included. And if Cloud itself loses or breaks a sync object, there is no copy to restore from, and a daemon whose team's copy went backwards would silently disagree with it.

## Solution

**Team history**: every save to a team project for 90 days, applied or set aside, read in the Mac app's History pane (a frame's history from its right-click, the whole project's from the project tab's menu) and by agents with `spool history <path>`. Saves are grouped into **stretches** so a busy day stays readable, can be filtered by person, and the history ends with where the project moved in from git. An editor can **Compare with now** (the frame as it stood, beside today's, on the canvas) and **Restore** a file, a frame, a page or the whole project to the end of a stretch. A restore is ordinary new saves on top, marked as a restore, so it travels under the collision rule, counts against no fair-use limit and can itself be undone. Saves older than 90 days are deleted; the team's current files never are.

Separately, Spool keeps a **Backup**: a daily copy of every sync object in R2, kept 30 days, that only Spool restores from. A restore from a backup gives the team's copy a new epoch; every daemon then checks its local copy against it, and work saved after the backup comes back from whichever members' Macs hold it, as ordinary saves.

## User Stories

1. As an editor, I want to open a frame's history from its right-click menu (History…), so that I see only what changed that frame.
2. As an editor, I want to open the whole project's history from the project tab's menu, beside Match the team, so that I see everything the team did.
3. As an editor, I want ⇧⌘H to show and hide the History pane, so that I reach it without the mouse.
4. As an editor, I want History to stand as a pane beside Properties and Agent, so that it docks, tabs and closes like every other pane.
5. As an editor, I want the pane's head to name what it shows (a frame or the project), with × widening a frame's history to the project's, so that I always know the scope.
6. As an editor, I want a frame's history to include saves to shared files the frame imports, marked "through order-button.tsx", so that a change to a shared component that altered my frame is not hidden.
7. As an editor, I want saves grouped by day and then into stretches (one person's run of saves on one machine with no 10-minute gap), so that 2,000 saves a day read as a handful of rows.
8. As an editor, I want each stretch to show when it ended, who, how long it ran, what it touched and its save count, so that I can find the moment I want.
9. As an editor, I want the gap between rows to grow with the quiet between stretches and a long gap to say "50 min quiet", so that the rhythm of the day is visible.
10. As an editor, I want to pick everyone or one person from the pane's head, so that I can follow one teammate's work.
11. As an editor, I want a restore to show as a row of its own, marked ↺ and "restore", naming what it put back to when, so that restores are never mistaken for ordinary work.
12. As an editor, I want a stretch with set-aside saves to say "1 set aside", and inside it the file to say whose save arrived first, with Compare and Put back, so that lost work can still be found later.
13. As an editor, I want the pane to end with "Saves are kept 90 days. Today's files are always kept.", so that I know what history can and can't give back.
14. As an editor of a project that moved in from git, I want the history to end with "Moved in from git on <day> by <person>, in <commit>", so that I know to look in git for anything older.
15. As an editor, I want picking a stretch to fold it open to its files, with Compare with now and Restore…, so that I act on one moment.
16. As an editor, I want Compare with now to stand the frame as it was beside today's on the canvas, each labelled with its moment or "now", so that I see the difference before restoring.
17. As an editor, I want a frame deleted since to come back dashed in Compare, so that I can find a frame someone removed.
18. As an editor, I want Compare to render the frame with its own files and the shared files it imports as they stood then, so that what I see is what the team saw.
19. As an editor, I want Restore… from a frame's history to restore that frame to the stretch's end, so that one bad change is undone without touching anything else.
20. As an editor, I want Restore… from the project's history to offer each frame and page the stretch touched, and the whole project, each with its file count, so that I choose how much goes back.
21. As an editor, I want to restore a single file from its line in an open stretch (Restore on hover), so that the smallest fix is one click.
22. As an editor, I want restoring a frame that imports a shared file changed since to offer that file as a checkbox, off by default, naming the other frames that use it, so that I don't break my teammates' frames by accident.
23. As an editor, I want one question before restoring, saying the restore reaches the team as new saves and can be undone, so that I restore knowingly and without fear.
24. As an editor, I want a restore to bring back files deleted since and remove files created since, within what I restore, so that the target really stands as it did.
25. As an editor, I want a done restore to say so in a toast with Undo (⌘Z), so that a mistaken restore costs one key.
26. As an editor, I want a restore's row to offer Undo this restore, so that I can take it back later too.
27. As an editor, I want my restore to reach every teammate's disk and canvas like any save, so that the team sees the same files.
28. As an editor, I want a restore that collides with a teammate's newer save to be set aside like any save, so that a restore never overwrites work the team made since without telling anyone.
29. As an editor, I want a restore to count against no fair-use limit, so that restoring a whole project never pauses my sync.
30. As a viewer, I want my role never to let me restore, so that only those who hold the files change them.
31. As an agent, I want `spool history <path>` to list every version of a file for 90 days, with who, which machine, when, and whether it was set aside or a restore, so that I can find the version a person means.
32. As an agent, I want `spool history <path> --at <time>` to print the file as it stood at that moment, so that I can read an old version and write it back myself as an ordinary edit.
33. As an agent, I want `spool skill` to teach `spool history`, so that I know it exists and that it is read-only.
34. As an agent on a project that is not a team project, I want `spool history` to say its history is git's, so that I look in the right place.
35. As a member, I want a removed member's saves still listed under their name, so that their damage can be restored file by file or by restoring the project to a moment.
36. As a team, we want saves older than 90 days, set-aside ones included, deleted, so that our history stays bounded as promised.
37. As a team, we want our current files never deleted by the purge, so that an old, untouched file is safe.
38. As a team, we want a daily backup of our project kept 30 days, so that our files survive a fault in Cloud.
39. As the maintainer, I want one admin command that restores a team project's sync object from a chosen day's backup, so that I can repair a broken team's copy.
40. As an editor whose team's copy was restored from a backup, I want work I saved after the backup to go back up from my Mac on its own, as ordinary saves, so that nothing I did is lost.
41. As an editor who was offline since before the backup, I want my older files to take the restored team's version rather than go up, so that I don't roll the team back.
42. As two editors holding the same newer file after a backup restore, we want it to land once, so that the team's copy isn't churned.
43. As a member watching the canvas in a browser, I want the browser to show the restored copy after a backup restore, so that I don't see stale frames.
44. As the maintainer, I want backups to skip projects with nothing new since their last one but always keep each project's newest backup, so that a quiet project still has a copy and backups cost little.
45. As the maintainer, I want a purged team's backups to age out within 30 days, so that deleting a team really deletes it.

## Implementation Decisions

**Team history in the sync object (spool-cloud)**
- The save log stays the `saves` rows the sync object already keeps (who, which machine, when, applied or set aside, content hash). It gains a restore reference per save: which restore it belongs to, what it restored (file, frame, page or project) and to which team version. A restore's saves are always their own stretch.
- A **moment** is a team version: the last save of a stretch. Rows name it by its time; restores, Undo and `--at` resolve to a version.
- Stretches are grouped in the sync object on read, from the rows: per account and machine, a run with no 10-minute gap. History is read in pages of days, newest first, filtered by person and by a set of paths (a frame's folder plus the shared files it imports, which the daemon names, since it knows the imports).
- New read routes on the team project, beside the comments routes, for any member with a device session or a browser session (viewers included, so a later spool.page page needs no new rule): stretches by day; one stretch's files; every save to one path; the team's files (path and content hash) as they stood at a version, for a set of paths or prefixes; bytes by content hash, as the compile object already reads them.
- Restores travel as one `saves` bundle carrying the restore reference. The object checks that each save's content hash is the path's hash at the named version (null where the path didn't exist); a save that doesn't match is refused. A checked restore counts against neither the minute's bucket nor the month, as a move's saves already don't. Each save still collides on its own base.
- The protocol change lives in core's sync protocol, which spool-cloud imports; the cloud deploys before the spool release that sends it, and accepts the current protocol and the one before.
- The move-in record (when, by whom, which commit took `design/` out of git) is kept in the object's meta, apart from the saves, so the purge can't take it. The daemon reports the commit once git takes the move commit (today it is only on the Mac). Projects already moved in take when and by whom from their first save on waking.
- The existing `restored` notice (an edit beating a delete) is not a Restore; code names keep them apart.

**Purge and backup (spool-cloud)**
- One daily pass reaches every live team project's sync object, spread over the five-minute cron's ticks so each tick stays inside the Worker's subrequest limit and each object is visited about once a day.
- Purge: delete saves older than 90 days, applied or set aside, except the save that made each current file; then delete blobs no remaining save or current file references; drop edit-beats-delete notices whose save is gone. A save whose base was purged merges `canvas.json` as a save with no base.
- Backup: a copy of every table to an R2 bucket in the EU jurisdiction, read and written in 1 MiB parts so memory stays flat. Blobs are stored once by content hash and shared across days; each day adds a manifest of the other tables. Skipped when nothing changed since the last backup. Manifests older than 30 days are deleted, except a live project's newest; blobs no remaining manifest names are deleted. A purged project's manifests all age out.
- Restore from backup: a maintainer-only route (as the bucket's refill route is) names a team project and a backup day. The object closes every socket, replaces its storage from the backup part by part, keeps its comment tables where they are still readable, records the head it restored to, and takes a new **epoch**. The compile object drops its copy and reads the team's copy again; browsers on the canvas reload it.

**Daemon and app (spool)**
- `welcome` carries the epoch and, after a restore, the head it restored to. A daemon keeps the epoch per local copy. On a new epoch it asks for the team's paths and content hashes (the same list the drift check in #117 compares against; whichever ticket lands first builds it) and, for each difference: a path it last applied at a version above the restored head, or holding unsent local changes, goes up as an ordinary save on the team's current version; a path the team has and it doesn't know takes the team's version; every other difference takes the team's version. The collision rule settles two holders; an identical save changes nothing.
- `spool history <path>` (and `--at <time>`) is a read verb: it reads through the daemon with the machine's device session and prints, never writes. The skill's team-project section teaches it.
- History is a fourth kind of pane, offered on team projects only, laid out by the existing pane layout like the Comments pane. It reads stretches through the daemon.
- Compare: the daemon fetches the frame's files and its imports at the moment by content hash, keeps them in a cache on the machine (never in the local copy), and compiles the frame from those bytes through the compile host. The canvas stands it beside today's frame, labelled; a deleted frame shows dashed in today's place.
- Restore: the daemon works out the target's files at the moment against today's, writes them to the local copy and sends one marked bundle. Undo, from the toast or the row, is a restore of the same paths to the version just before that restore.
- Motion follows the prototype as drawn: house timings, everything off under reduced motion.

**Glossary**
- spool-cloud's GLOSSARY.md gains Team history, Restore and Backup as written on branch `108-wayfinder-dev-240` (3578d52), plus Stretch and Epoch. Core's GLOSSARY.md gains Team history, Restore and Stretch, kept apart from core's History (git).

## Testing Decisions

- Test external behaviour at the highest seam: in spool-cloud, the sync object over its socket protocol and its HTTP routes in the worker test pool (prior art: the sync, moves and comments worker tests), and the daemons against the deployed-shape worker in the team e2e suite (prior art: collisions and local-copies e2e). In spool, the daemon against the sync test harness (prior art: team-sync tests), its HTTP routes, the CLI verb's output (prior art: CLI and comments-verb tests), and the pane in a browser test (prior art: set-aside and comments browser tests).
- The harness's fake sync object grows the same reads, restore check and epoch, so core tests don't need the cloud.
- Time is injected: tests move the clock past 10 minutes for stretches, 90 days for the purge and 30 days for backups; nothing sleeps.
- R2 is the worker pool's local bucket; no test reaches Cloudflare. A real backup restore is run once on a deployed staging object before any team depends on it.
- A good test names a person-visible outcome ("Ben's restore brings the deleted frame back on Ana's disk"), never a table or a query.

## Out of Scope

- A history page at spool.page, for viewers or anyone (none at launch, per #57).
- An undo of everything one person did.
- Cloudflare's point-in-time recovery as a second restore path.
- The drift fingerprint, the silent repair, Offline after 30 s, Match the team and the update pause: #117.
- What a removed project's copy and history become (#100, in #116) and a lapsed team's history after 6 months (#90).
- Exporting history as git (#101).
- Alerts on backup or purge failure: they join #117's alerts channel.

## Further Notes

Audit of what ships (main of both repos, 2026-10-18):
- Save log with who, machine, when, applied or set aside, by content hash, set-aside bytes included: **shipped** (spool-cloud `src/worker/sync/object.ts`, `saves` and `blobs`, `apply()`).
- Restore travelling as saves under the collision rule; viewers can't save: **shipped** as machinery (#72, #73), restore itself **missing**.
- Reading the history: **partial**, only the newest applied saves for the navigator's recent (`object.ts` `history()`, `src/worker/frames/object.ts`).
- Restore marks, restore limit exemption: **missing** (prior art: the move's exemption, `mover`/`moved` meta).
- `spool history`: **missing** (`src/cli.ts` has only `init --history`, core's git History in `src/daemon/history.ts`).
- History pane, menus, ⇧⌘H, stretches, person filter: **missing** (prior art: Comments pane, `src/ui/canvas/pane-layout.ts`, `comments-pane.tsx`).
- Compare with now: **missing** (set-aside marks compare only the local copy, `src/daemon/set-aside*.ts`, `src/ui/canvas/set-aside.tsx`).
- Moved-in line: **partial**, the object knows the move's saves but `mover` is cleared after the move and the commit stays on the Mac (`src/move-in.ts`, `design/.spool/move-commit.json`).
- 90-day purge, set-aside retention (#73's last criterion): **missing**; nothing is deleted but a whole object on team purge (`forget()`).
- Daily R2 backup: **missing** (only publication buckets in `wrangler.jsonc`; the `*/5` cron in `src/worker/index.ts`).
- Maintainer restore and epoch: **missing** (`Welcome` in `src/team-sync-protocol.ts` has no epoch; the daemon's welcome handler in `src/daemon/team-sync.ts` ignores a head that went back).
- Glossary: Team history, Restore, Backup **unmerged** on spool-cloud `108-wayfinder-dev-240`; Drift and Paused on `110-wayfinder-dev-172` belong to #117.

## Open questions

1. **Viewers can read history but have no surface.** #57 lets viewers read it, yet history lives only in the Mac app, which viewers don't use, and spool.page has none at launch. Recommendation: the routes allow viewers; no viewer UI at launch, revisit with a spool.page page.
2. **Restoring a frame that was moved or renamed since.** Restore acts on paths, so the old frame comes back at its old path beside the moved one. Recommendation: allow it, and have the question before restoring say "comes back as a copy beside <new name>"; comments stay on the moved frame.
3. **Comments after a backup restore.** Comments live in the sync object; members' Macs don't hold them, so comments made after the backup can't come back from anyone. Recommendation: keep the object's comment tables when they are readable and restore only files and history; when the object is lost outright, comments since the backup are lost and the team is told.
4. **Telling a team its project was restored from a backup.** #58 keeps drift silent but says nothing of a backup restore. Recommendation: email the team's admins once, naming the backup's day and that newer work came back from members' Macs.
5. **Comments on a frame deleted over 90 days ago** read the frame's last geometry from its newest applied save, which the purge deletes. Recommendation: purge it anyway, so no deleted file outlives 90 days, and let those comments stand as a comment does whose frame has no geometry; keep the newest save only if that proves unreadable.
6. **Projects moved in before this ships** have no commit on record. Recommendation: their line says "Moved in from git on <day> by <person>" without a commit.

*From Linear DEV-265.*

Related: #105, #94, #89, #73, #65, #58, #57

Plane: SPOOL-114

## Comments

### agent, 2026-10-21T16:50:44.722Z

Spec written into the body and cut into build tickets (agent-hub task 205): #186, #187, #188, #189, #190, #191. The audit of what already ships is in Further Notes; six product questions are left open at the end of the spec, each with a recommendation.
