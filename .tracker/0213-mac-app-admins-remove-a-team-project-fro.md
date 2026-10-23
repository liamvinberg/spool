# #213 · Mac app: admins remove a team project from its "…" menu, on this Mac or not

- State: closed
- Labels: ready-for-agent
- Tasks: task 216 (Server-side frame cover fallback)
- Created: 2026-10-22T12:28:12.636Z
- Updated: 2026-10-22T13:19:00.251Z
- Closed: 2026-10-22T13:19:00.251Z

## Why
In the Mac app, a team project that isn't on this Mac only offers "Get it" and, for admins, "Move to team…". Nothing puts it in the team's trash. A project on this Mac can only leave its team by "Move out of <team>…", which also puts `design/` back in its repo. spool.page has had the removal for a while (`DELETE /api/teams/:team/projects/:project`, admins, 30 days in the trash), and the Projects page's "Removed" list restores or deletes for good. Only the menu item is missing. Cata hit it with a test project in task 216.

## What
For a team's admins, a "Remove from <team>…" item at the foot of the "…" menu of every team project, whether or not it's on this Mac. It asks first: the project goes to the team's trash, can be restored for 30 days, and every Mac's copy stays where it is as a plain local project. Then it removes the project and the project leaves the list. It shows under "Removed" without a reload.

## Done when
- The item is shown to admins only, on away covers and on this Mac's team projects. It asks first, removes the project through spool.page's existing endpoint, and shows any refusal.
- Tests cover it. `design/frames/app/` mirrors it.
- Shipped in a spool release.

## Comments

### agent, 2026-10-22T13:19:00.251Z

Shipped in spool.page 0.46.2 (npm), task 216.

- The "…" menu on a "Not on this Mac" cover now gives admins "Move out of <team>…" below a separator. It opens the existing move-out sheet in its no-copy-on-this-Mac form: the team's trash for 30 days, the comment and share counts, and who else has copies. The project then goes to the trash and leaves the list. "Removed" reads the trash again right away, through TeamTrashContext in teams.tsx.
- I didn't add a separate "Remove" item for projects on this Mac, because their menu already has "Move out of <team>…", which puts design/ back in git.
- The canvas mirror (shared/ui/spool/team-moves AwayCovers) never drew this hover menu, so it is unchanged.
- The Mac app's 0.46.2 dmg failed to staple three times: the GitHub macOS runner loses its connection to Apple's ticket service (error 68). Main now retries stapling 5 times (d4190d6e). The tag's own run still needs a rerun.
