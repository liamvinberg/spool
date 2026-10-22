# #197 · Leaving a team: a removed project waits 30 days in the trash

- State: closed
- Labels: ready-for-agent
- Parent: #116
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:54:18.867Z
- Updated: 2026-10-21T19:58:10.038Z
- Closed: 2026-10-21T19:58:10.038Z

## Parent

Spec: a project leaves a team, and deleting an account (#116)

## What to build

Removing a project from a team (Move out of <team> in the app, `spool move --out`, or the plain remove) puts it in the team's trash for 30 days instead of deleting it. Every copy still ends at once, as today. Spool Cloud keeps the project's files, history, set-aside saves, comments, compiled frames, covers and shares. Its shares answer with the stopped-share page, and its name stays reserved: moving or taking a project into the team under that name is refused with the date it frees up. A daemon asking about it is told `removed`, with the team, who removed it and when, never "not a member". The copy's notice says "Ana removed tidemark-app from Tidemark. It's now a project on this Mac only."

The team's Projects page, in the Mac app and on spool.page, gets a **Removed** section for admins: who removed each project, when, days left, **Restore** and **Delete now** (confirmed). Restore brings everything back as it was, shares and comments included. It is refused while the team has no paid time left. Members then Get it: on an ended copy it resumes the copy, and where `design/` was already put back in git it makes the move-in commit again. Delete now, and a scheduled purge 30 days on, forget the sync object and compile object and then the row, retrying on the next run if an object can't be cleared. The move-out sheet counts shares, says they pause and that the project can be restored for 30 days, and no longer says comments are deleted. `spool move --out` and the skill say the same.

Spans spool-cloud (soft delete behind one "live project" condition, standing, shares, routes, purge on the existing cron) and spool (daemon's end with who, Get it after restore, Removed section, sheet, CLI and skill words).

## Acceptance criteria

- [ ] Removing a project (plain or moved out) keeps its row, shares, comments, compile object and sync object, and every live-project read (lists, access, sync, canvas, shares, comment emails, moves) leaves it out
- [ ] A removed project's standing reads `removed` with the team, the remover's name and the time. A daemon connecting later ends its copy with "<name> removed <project> from <team>"; a moved-out copy keeps its "pull its repo" notice
- [ ] Shares of a removed project show the stopped-share page, and work again after a restore
- [ ] A name held by the trash is refused for a move in or team move, with the date it frees
- [ ] Admins see Removed with who, when and days left; editors and viewers don't, and the routes refuse them
- [ ] Restore brings back files, history, set-aside saves, comments, covers, shares and the address, and is refused for a team with no paid time left
- [ ] Get it after a restore resumes an ended copy, and in a checkout where `design/` is back in git it makes the move-in commit again
- [ ] Delete now and the 30-day purge clear the sync and compile objects and delete the row with its shares, forwards and moved-out marker; running the purge twice changes nothing more, and a failed clear is retried
- [ ] The move-out sheet, `spool move --out` and the skill say the project waits 30 days in the trash, how many shares pause, and that comments are kept
- [ ] Glossary: **Removed project** lands in spool-cloud's from branch `118-wayfinder-dev-251`; spool's **Local copy** says the notice names who removed it
- [ ] Tests at the worker routes (Workers pool, injected `now`) and at the daemon against a fake spool.page, with real git for the Get it commit

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T19:58:10.038Z

Merged: spool a963331e (merge 205 #116 …) and spool-cloud f7dc00e. Built: soft-delete trash (migration renumbered to 0038_removed_projects.sql after #115's 0036/0037), one liveProject condition, standing removed with who/when, shares stopped while removed and back on restore, name held with its free date (409 name_in_trash), admin Removed list with Restore (refused 402 unpaid while the team has no paid time, spec Q5) and Delete now, 30-day purge on the existing cron with retry, Get it after restore (resume, or redo the move-in commit), move-out sheet / spool move --out / skill words, glossaries. Spec Q1 taken: comments wait in the trash and come back. Decisions: comment emails for a removed project are dropped; restore past 30 days answers 404; remover shows as "Removed" once their account is gone. Human: design/frames/app mirrors for the Removed section, move-out sheet wording and ended-copy notice; deploy runs migration 0038.
