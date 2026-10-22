# #198 · Leaving a team: put design/ back in git from a copy that ended or went local

- State: closed
- Labels: ready-for-agent
- Parent: #116
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:54:18.894Z
- Updated: 2026-10-21T19:58:10.082Z
- Closed: 2026-10-21T19:58:10.082Z

## Parent

Spec: a project leaves a team, and deleting an account (#116)

## What to build

**Put design/ back in git**, in the app only, on any copy that ended or went local inside a checkout whose branch still tracks `spool.json`: the project removed, its person removed or made a viewer, the team deleted, or the team gone local. It shows as an action on the copy's sync notice ("No longer synced…" / "…has gone local…") and as an item on its cover menu. It isn't offered on a copy marked moved out (that commit comes by pull) or on a copy in no repo.

It makes one commit on the current branch through the existing `commitPaths` machinery (scratch index, no hooks, no signing, waits out a merge or rebase, never pushes). The commit adds `design/` as it is on disk, with the solo `.gitignore` in place of the team's `*`, and removes `spool.json`, with the message `design: moved out of Spool Cloud`. A gone-local copy is ended first, so it never follows the team again once the team pays. When git can't take the commit yet, the existing commit-waiting note says so and spool tries again.

Spans spool only (daemon route, notice action, cover menu).

## Acceptance criteria

- [ ] An ended or gone-local copy in a checkout tracking `spool.json` offers Put design/ back in git on its notice and its cover menu; a moved-out copy, a copy in no repo and a live copy don't
- [ ] It makes exactly one commit on the current branch adding `design/` and removing `spool.json`, message `design: moved out of Spool Cloud`, with hooks not run and nothing pushed
- [ ] During a merge or rebase it waits and commits after; a detached head or no git is said, not crashed on
- [ ] A gone-local copy is ended by it and doesn't reconnect when the team pays again
- [ ] Two clones that each make the commit on identical files merge cleanly on pull (scratch-repo test)
- [ ] spool's glossary **Local copy** mentions Put design/ back in git
- [ ] Tests at the daemon with real git in a scratch repo, and the notice and menu as rendered markup

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T19:58:10.082Z

Merged: spool a963331e (merge 205 #116 …) and spool-cloud f7dc00e. Built: POST /api/p/:project/back-in-git; Put design/ back in git on the ended/gone-local notice and the cover menu (not on moved-out, no-repo or live copies); one commit through commitPaths (solo .gitignore, design/ added, spool.json removed, "design: moved out of Spool Cloud", no hooks, waits out a rebase, never pushes); gone-local copy ended first; two clones merge cleanly (back-in-git.test.ts). No confirm dialog; the copy's record is kept marked ended so Get it after a restore can take it back. Human: design/frames/app mirrors for the notice action and cover-menu item.
