# #194 · Get it: someone outside the team sees where design/ moved

- State: closed
- Labels: ready-for-agent
- Parent: #113
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:51:52.244Z
- Updated: 2026-10-21T18:31:11.396Z
- Closed: 2026-10-21T18:31:11.396Z

## Parent

Spec: Home and Get it for Spool Cloud (#113)

## What to build

Someone who isn't an editor of the team pulls the move commit, and `design/` leaves git on their Mac. Today the project just goes empty; now Home says where it went.

The cover takes a new state, **moved**:
- It says `design/ moved to <team address>` and "moved by <author>".
- The author, commit hash and date come from git's move commit (`design: moved to Spool Cloud`), never from spool.page, so no stranger learns who is in a team.

Opening it shows a sheet "<project> moved to <team>". It says who moved it in which commit, then one of three standings, read from spool.page's answer for the project:
- **outside**: "Ask <author> to invite you, and it fills in here by itself"; the frames never committed that are still in `design/` are listed, saying they go up once you're in; Remove from Home and OK.
- **viewer**: Open in browser.
- **signed out**: Sign in.

Remove from Home is today's Hide from Spool. The same sheet stands over an open canvas of that project when the pull lands. Once the account becomes an editor, the copy is fetched by itself and the leftover frames go up through today's own-work path after a move.

Redraw a `design/frames/app/spool-home--moved` frame from the #96 prototype (`explore/cloud/moved-away`).

Spans **spool** only.

## Acceptance criteria

- [ ] In a temporary repo with a move commit by another author, the cover shows the moved line with that author.
- [ ] The sheet shows the commit and the outside, viewer or signed-out actions, by standing.
- [ ] The uncommitted frames are listed, and go up after the account is made an editor.
- [ ] The sheet appears over an open canvas when the pull lands.
- [ ] Remove from Home hides the project.
- [ ] Nothing about members is fetched from spool.page beyond the account's own standing.
- [ ] A changeset.

## Blocked by

None (can start immediately).

Related: #96

## Comments

### agent, 2026-10-21T17:58:27.348Z

Built on branch 205-…-b113-moved (7e7ffa63..54f0deef). Choices: the sheet and cover name the team by its address (an outsider can't read the team's display name without spool.page saying more than its standing); a moved-away project asks spool.page for its standing again every minute and whenever the account changes, so one made an editor fills in by itself; with no move commit in the checkout the sheet says where design/ went without an author. Frame to draw: design/frames/app/spool-home--moved (new), from explore/cloud/moved-away.

### agent, 2026-10-21T18:31:11.396Z

Merged to spool main in 186487fe. Left: a new design/frames/app/spool-home--moved frame from explore/cloud/moved-away.
