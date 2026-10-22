# #200 · Leaving a team: a team export as git repositories with their history

- State: closed
- Labels: ready-for-agent
- Parent: #116
- Blocked by: #199
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:54:18.955Z
- Updated: 2026-10-21T19:58:10.124Z
- Closed: 2026-10-21T19:58:10.124Z

## Parent

Spec: a project leaves a team, and deleting an account (#116)

## What to build

An admin takes a team's data out of Spool Cloud from the Mac app. Choosing **Export…** on a team project's cover menu, or **Export all** in the team's Settings › General, asks for a folder and writes `<team address> export <date>/` into it. That folder holds `team.json` (members with name, email, role and joined; shares with project, pages, people's addresses or link host, made and by whom) and one git repository per project. Each repository holds `design/` with the team history as commits, built with `git fast-import`: one per applied save, and one per bundle, so a move in is one commit. Each commit is authored `Name <email>`, or `Former member <>` for an account that's gone, at the save's time. Files older than the kept history go into a first commit, "design/ as Spool Cloud held it on <date>". The last commit's tree matches the team's current files. Progress and Cancel work as the project transfer's do, and missing git is said plainly. The local "Export project…" (`.spool` archive) stays as it is.

spool-cloud gives admins a paged read of a project's applied saves (version, path, hash or deleted, account, time, bundle), the authors as People shows them, blobs by hash in bounded answers, and a team read of members and shares. These answer for a live team, a lapsed one, and a deleted one until its `purge_after`, and refuse editors, viewers and everyone else.

On spool.page, Export opens the Mac app on the export through Open in spool, or offers the download when the app is missing. A deleted team stays in its admins' switcher until its purge, marked "Deleted · gone on <date>", and opens to one page with Export all. The Delete team confirm adds "Admins can export it until <date>."

Spans spool-cloud (export reads, deleted-team access for admins) and spool (daemon export job, menus, Settings, browser hand-off, deleted-team page).

## Acceptance criteria

- [ ] Export… (admins, team projects) and Export all (admins, Settings) write the folder with `team.json` and one repository per project; editors and viewers see neither and the reads refuse them
- [ ] A scratch team's history exports as the expected commits: one per save or bundle, right authors and times, Former member for a deleted account, and a final tree equal to the team's files
- [ ] The reads page through any size of history and blob set within bounded answers
- [ ] Admins can export a lapsed team, and a deleted team until its purge date; after the purge, nothing answers
- [ ] A deleted team shows in its admins' switcher as "Deleted · gone on <date>" with only Export all; the Delete team confirm names the date
- [ ] On spool.page, Export opens the Mac app on the export, or offers the download
- [ ] Cancel stops the job and leaves no half-written repository named as complete; missing git is said
- [ ] Glossary: **Team export** lands in spool-cloud's from branch `119-wayfinder-dev-252`
- [ ] Tests at the worker routes (Workers pool) and at the daemon against a fake spool.page with real git

## Blocked by

- Leaving a team: delete your own account, and Former member (#199)

## Comments

### agent, 2026-10-21T19:58:10.124Z

Merged: spool a963331e (merge 205 #116 …) and spool-cloud f7dc00e. Built: admin-only paged export reads in spool-cloud (saves, files, blobs in bounded answers, team file of members and shares; live, lapsed, deleted until purge_after; deletedTeams on /api/teams), daemon export job with git fast-import (one commit per save, one per bundle per spec Q4; Former member <>; first commit for files older than kept history; final tree checked; built under .incomplete and removed on cancel; missing git said), Export… on admins' team covers (Mac and spool.page), Export all in Settings › General, a deleted team kept in its admins' places sidebar as "Deleted · gone on <date>" opening to Export all alone (spec Q2; the switcher became the places sidebar on main, so it lives there), Delete team confirm names the date, spool.page hands off via Open in spool or offers the download, desktop folder dialog gets an "export" purpose. #186's history routes hadn't landed, so the export reads live in their own files (sync/export.ts, teams/export.ts). Not built: the 6-months-after-lapse purge (out of scope per spec). Human: design/frames/app mirrors (deleted team place and page, Export row, confirm text, Export… on covers, progress toast).
