# #74 · Local copies and git: fetching, worktrees, the git guard and init choices

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Blocked by: #71
- Created: 2026-10-18T17:43:56.010Z
- Updated: 2026-10-18T17:43:59.255Z
- Closed: 2026-10-18T17:43:59.255Z

## Parent

#65

## What to build

Any `spool` command that walks up to a `spool.json` with no `design/` fetches the folder first, then carries on, covering fresh clones and new worktrees. Plain errors: not signed in (run `spool login`), not a member (ask an admin), viewer (the browser link), cloud agent (not supported yet). Several local copies on one machine all sync and show as one cover; `spool remove <lane>` forgets one local copy. The skill says `spool.json` with no `design/` means run `spool open`. The daemon never syncs what git writes into `design/` (checkout, pull, reset, merge): it restores the team's version, and refills a folder that vanished instead of syncing deletes. `spool init` for a signed-in editor or admin with no flag writes nothing and names the choice ("You're in Tidemark and Devosurf. Run again with `--team <name>`, or `--local`."), or shows a picker in a terminal; `--local` stays offline; a machine setting "New projects go to: ask / only this Mac / "; the app's New project follows the switcher.

## Acceptance criteria

- [X] A fresh clone with `spool.json` gets `design/` on `spool open` and on any other verb
- [X] A new worktree is a second local copy under the same cover; `spool remove` on it leaves the team untouched
- [X] Each error case prints its plain message
- [X] Checking out an old branch that tracks `design/` restores the team's version locally and changes nothing for teammates
- [X] Pulling a commit that removes `design/` refills it rather than deleting for the team
- [X] `spool init` behaves per signed-in state, flag and TTY; not signed in is unchanged and offline

## Blocked by

- #71

*From Linear DEV-189.*

Plane: SPOOL-74

## Comments

### agent, 2026-10-18T17:43:59.246Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0. 0.31.0 fixed what review found.

Decisions where the spec was silent:
- spool init refuses when spool.page can't be reached, instead of going local quietly.
- A copy keeps syncing on any branch, even one with no spool.json, and history stays off there.
- The git guard never deletes. A file git put there that the team doesn't have stays on disk, isn't sent, and spool says so once.
- The guard never writes git's index. After checking out an old branch, going back may need --force or a stash.
- The guard runs git off the daemon's main loop and reads at most the newest 100 reflog entries.
- A spool.json from another tool is ignored and never written over.
- spool looks again right after any new folder watch starts, so a save made in that gap still goes up.
- Cloud agents: Claude Code on the web and Copilot are named. Others read as an agent on a machine with no Keychain.

Nothing left on this ticket.

Checks for Liam on a real Mac:
- [ ] spool init in a terminal as a Devosurf editor shows the picker.
- [ ] git worktree add, then spool flows in the new folder. Home shows one cover with 2 copies.
- [ ] Check out a pre-team branch. A teammate's save still arrives, their canvas doesn't move, and git log gains no design commit.
