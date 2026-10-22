# #193 · Get it: finds your checkout and says what each place holds

- State: closed
- Labels: ready-for-agent
- Parent: #113
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:51:52.222Z
- Updated: 2026-10-21T18:31:11.337Z
- Closed: 2026-10-21T18:31:11.337Z

## Parent

Spec: Home and Get it for Spool Cloud (#113)

## What to build

The Get it sheet finds the right checkout and says, on each place, what is there, before anything happens. This is the #96 addendum and the read-only half of #96.

**Finding checkouts.** When the sheet opens, the daemon looks for git checkouts up to 3 levels deep under `~/code`, `~/dev`, `~/Developer`, `~/Projects`, `~/src`, `~/repos` and `~/GitHub`.
- It reads only each checkout's origin from `.git/config`, following a worktree's `.git` file.
- It never reads Desktop, Documents or Downloads.
- Matches join today's known checkouts. A folder picked with "In a checkout…" is remembered in the daemon's state and offered next time.
- Ranking: already linked to this project first, then the `design/` holding the most of the team's frames, then the most recently used.
- Finding registers nothing.

**The survey.** Each place's detail line says what the daemon found there:
- empty;
- your checkout, with a `design/` already in it;
- on a branch from before the move;
- already holds its own project;
- identical to the team's.

One plain sentence under the list gives the counts (same, older, changed here, only here) for the chosen place. There are no callout boxes.

**The history lookup (spool-cloud).**
- The sync object answers, for a batch of paths and content hashes, whether each is the team's current one, one the team had at that path (a delete counts), or never seen.
- It answers from the saves it keeps (#113 open question 3).
- It is an editor's read on the project. It is batched and counts against no save limit.

**Acting on what can be decided without merging:**
- **Another project's `design/`** (no frame paths in common) is dimmed with its reason, and Just on this Mac is picked.
- **A pre-move branch**:
  - What counts as pre-move: `design/` is tracked by git, and the branch lacks the move commit (`design: moved to Spool Cloud`, reachable from the remote's default branch).
  - The sheet names the commit and its branch and shows the command.
  - "Get it" waits as "Waiting for the merge…". The daemon carries on by itself once the commit arrives, and today's path then sends the branch's frames up.
- **Identical to the team's** is taken with no question.

A `design/` that differs is still refused in this ticket, saying it will be brought level (the next ticket does that).

Spans **spool** (the scan, the remembered picks, the survey, the sheet, the waiting) and **spool-cloud** (the lookup).

## Acceptance criteria

- [ ] Over a fake home, the scan finds checkouts in each code folder down to 3 levels, worktrees included. It never touches Desktop, Documents or Downloads, and registers nothing.
- [ ] A folder picked with "In a checkout…" is offered at the next Get it. The ranking puts a linked checkout first.
- [ ] Each survey reads on its place's detail line, and the counts sentence matches the folder.
- [ ] The lookup answers current, had, deleted-then and never-seen correctly, in batches, refuses a viewer, and uses no save budget (Workers pool test).
- [ ] Another project's `design/` is dimmed and can't be chosen.
- [ ] On a pre-move branch the sheet names the commit, branch and command, and finishes by itself after the merge, sending the branch's frames up.
- [ ] An identical unlinked `design/` is taken with no question.
- [ ] A changeset in spool; spool-cloud deploys the lookup before spool's release uses it.

## Blocked by

None (can start immediately).

Related: #96

## Comments

### agent, 2026-10-21T17:37:53.994Z

Built on branch `205-are-there-any-other-gaps-compared--spec-205-b113-b113-getit` (spool) and `205-b113` (spool-cloud, commit 8ba5ff4).

Choices made where the ticket left room:
- The team's history is asked through a narrow new spool-cloud route, `POST /api/teams/:team/projects/:project/history/seen`. It answers current/had/never per (path, hash) from the sync object's files and applied saves, editors only, 1000 files per ask. #186's history work wasn't on origin/main; reuse it once it lands.
- Open question 3: "older" is classed against every applied save the object still keeps, so the window follows #114's retention.
- Against a spool.page without the route, the survey says only "Your checkout, with a design/ already in it" with no counts, and sync goes up blind as before.
- The scan reads ~/code, ~/dev, ~/Developer, ~/Projects, ~/src, ~/repos and ~/GitHub, three levels deep. It never follows a symlink and never reads Desktop, Documents or Downloads. Picked folders are kept in `<spoolDir>/get-it-picks.json` (last 20).

### agent, 2026-10-21T18:31:11.337Z

Merged to spool main in 186487fe; the history lookup POST /api/teams/:team/projects/:project/history/seen in spool-cloud main e28440f (8ba5ff4). It must deploy before spool's release uses it (without it Get it degrades to today's behaviour). Left: design/frames/app/spool-home--get-it redraw.
