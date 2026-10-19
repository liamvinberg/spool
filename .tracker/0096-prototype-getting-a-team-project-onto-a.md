# #96 · Prototype getting a team project onto a Mac that already has design/

- State: closed
- Labels: wayfinder:prototype
- Parent: #89
- Created: 2026-10-18T17:43:56.265Z
- Updated: 2026-10-18T17:44:00.066Z
- Closed: 2026-10-18T17:44:00.066Z

## Question

Get it refuses a folder that already holds a `design/` (`get-it.ts:69`), and a tracked `spool.json` silently merges local files into the team. How should picking a folder with a `design/` in it (tracked or untracked, same as the team's or not) look and choose? And what does someone who isn't in the team see when a pull takes `design/` away?

*From Linear DEV-247.*

Related: #100, #113, #75, #57

Plane: SPOOL-96

## Comments

### agent, 2026-10-18T17:44:00.048Z

**Liam, 2026-10-10:** ## Resolution

Prototype on the canvas: `explore/cloud/design-here` and `explore/cloud/moved-away` in spool.page/devosurf/spool (code in `design/shared/ui/explore/get-it-design/`). Cata, 2026-10-10: go with the recommendations, with set aside made as automatic as it safely can be.

**Get it into a folder with a `design/` spool never synced** (no record in `design/.spool`, whether `spool.json` is tracked, untracked or absent). Get it compares the folder with the team's copy and its 90-day history, and says what it found under the chosen place before anything happens (counts: same, older, changed here, only here). On Get it:
- same as the team's: kept;
- older (matches a version the team had, deletions included): takes the team's, nothing goes up, so deleted frames never come back;
- only here (the team never had the path): goes up as is;
- changed here where the team has its own: set aside on the canvas with the existing set-aside marks, to put back or let go. Nothing that would overwrite a teammate's file reaches the team without a click.

The same in every case:
- **design/ still tracked by git** (a branch from before the move): the sheet names the move commit and the branch it's on, shows the command (`git merge origin/main` or pull), and waits; once the commit arrives spool fills design/ and frames made on the branch go up, as today.
- **Another project's design/** (no frames in common with the team's): refused, choose another place.
- **Identical** to the team's: taken with no question. A copy that synced here before carries on as today.

**Someone outside the team pulls the move commit.** The cover says `design/ moved to tidemark` and who moved it. Opening it shows a sheet: who moved it in which commit (the commit's author from git, so spool.page never tells a stranger who is in a team), ask them to invite you, and the frames they never committed, still in design/, which go up once they're in. Remove from Home / OK. A viewer gets Open in browser; a signed-out person gets Sign in. The same sheet stands over an open canvas when the pull lands. "Keep a copy" (the last git version as a solo project) is ruled out: a second copy drifts from the team's.

Not chosen: refuse always; replace with the old design/ to the Trash. The build depends on team history (Decide history and restore for team projects (#57)) to tell "older" from "changed here".

### agent, 2026-10-18T17:44:00.057Z

**Liam, 2026-10-10:** ## Addendum (Cata, 2026-10-10)

**Finding the checkout.** Git keeps no list of clones on a Mac, so there is nothing to read. Today Get it offers only checkouts of projects spool has registered (`knownCheckouts` in `src/daemon/team-projects.ts`), a choice #75 made because its spec didn't say. Decided: when the Get it sheet opens, spool also looks up to 3 levels deep under the usual code folders in home (`~/code`, `~/dev`, `~/Developer`, `~/Projects`, `~/src`, `~/repos`, `~/GitHub`), reading only each repo's origin from `.git/config` (a worktree's `.git` file included). It never reads Desktop, Documents or Downloads, because macOS asks permission before an app reads those. A folder picked with "In a checkout…" is remembered. The sheet is unchanged; the right checkout is simply listed first.

**Kept lean, in the system's way.** What spool finds is said on the place itself (its detail line), with one plain sentence under the list; no callout boxes. A place Get it can't use (another project's design/) is dimmed with its reason, and Just on this Mac is picked instead. Frames on the canvas are updated to this.
