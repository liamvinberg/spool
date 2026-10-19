# #75 · "Get it" and moving a project into a team

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Blocked by: #74
- Created: 2026-10-18T17:43:56.020Z
- Updated: 2026-10-18T17:43:59.291Z
- Closed: 2026-10-18T17:43:59.291Z

## Parent

#65

## What to build

Home shows team projects not yet on this Mac dimmed with "Get it", which offers a known checkout on this Mac whose `origin` matches the project's repo (default), "In a checkout…" (folder picker), or "Just on this Mac" under `~/spool/<team>/<project>`. The cloud records the repo from `origin` as information, with ssh and https forms counting as the same repo, and the team page shows it; Spool never clones but shows the clone command. An existing project's cover menu and settings have "Move to team…": Spool uploads the whole folder, waits for the cloud to confirm, then makes one commit on the current branch with history's machinery (temporary index, no hooks, waits out a merge or rebase, never pushes): `design/` out of the index with files kept, `spool.json` in, message `design: moved to Spool Cloud`. The sheet says history before the move stays in git. Teammates who pull the move commit keep their folders.

## Acceptance criteria

- [X] Get it with each of the three choices produces a working local copy
- [X] ssh and https remotes for one repo match
- [X] Moving in makes exactly one commit with the stated contents, runs no hooks and doesn't push
- [X] In the harness, a teammate pulling the move commit ends with a full, synced `design/`
- [X] Viewer made editor can Get it

## Blocked by

- #74

*From Linear DEV-190.*

Related: #96

Plane: SPOOL-75

## Comments

### agent, 2026-10-18T17:43:59.281Z

**Liam, 2026-10-06:** Shipped in spool.page 0.29.0. 0.31.0 added what review found.

Decisions where the spec was silent:
- Known checkouts are only the ones spool already knows. It never scans the disk.
- "Just on this Mac" uses the projects folder setting, ~/spool by default.
- The clone command is always https.
- A failed move leaves its team project behind, and the next try reuses it.
- A teammate who never had the project in spool runs spool open after pulling.
- A move carries the project's shares over, so links already sent keep working.
- Files that never travel stay in git, and the Move sheet lists them first.
- A detached HEAD is refused. If the move commit can't be made, spool makes it at the next start and Home says so.

Nothing left on this ticket.

Checks for Liam:
- [ ] Move a real project into Devosurf. git log -1 says "design: moved to Spool Cloud", git status is clean and nothing is pushed.
- [ ] A teammate who pulls gets design/ refilled within seconds.
- [ ] A solo project with a link share keeps its link working after the move.
