# #196 · Get it: brings a never-synced design/ level with the team

- State: closed
- Labels: ready-for-agent
- Parent: #113
- Blocked by: #193
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:51:52.285Z
- Updated: 2026-10-21T18:31:11.449Z
- Closed: 2026-10-21T18:31:11.449Z

## Parent

Spec: Home and Get it for Spool Cloud (#113)

## What to build

Get it into a folder whose `design/` spool never synced brings it level with the team, where today it refuses or pushes stale files up blind. Never synced means no sync record in `design/.spool`, whether `spool.json` is absent, untracked or tracked.

Before the first connection, each file is classed through the survey's history lookup:
- **same**: kept.
- **older**: matches a version the team had at that path, a delete included. Takes the team's current state: nothing goes up, and a frame the team deleted never comes back.
- **only here**: goes up as ordinary saves.
- **changed here**: the team has its own version, and this one never matched any of the team's. The team's version lands, and this one becomes a set-aside mark with today's notice (Use theirs, Use mine, Ask agent). Nothing overwrites a teammate's file without a click.

`canvas.json` keeps its key-by-key merge. The case where the checkout already holds the team's `spool.json` (today's blind path) goes through the same classing. A refused Get it leaves the folder as it was found, as today. The sheet's sentence says what will happen, e.g. "Your 2 new files go up, and the 6 you changed where Tidemark has its own are set aside on the canvas for you to look at."

Spans **spool** (the classing, the marks, the sheet), using spool-cloud's lookup from the previous ticket.

## Acceptance criteria

- [ ] One folder holding all four kinds of file ends with: same and older at the team's version, only-here files saved to the team, and changed-here files set aside with marks. No team file is overwritten.
- [ ] A frame the team deleted, present here at a version the team had, stays deleted on the team and is removed here.
- [ ] A tracked `spool.json` checkout with a stale `design/` behaves the same, no longer pushing older files.
- [ ] A copy that synced here before carries on as today, with no classing.
- [ ] The counts in the sheet match the result.
- [ ] A refusal mid-way leaves the folder as found.
- [ ] A changeset.

## Blocked by

- Get it: finds your checkout and says what each place holds (spool#193)

Related: #96

## Comments

### agent, 2026-10-21T17:37:54.021Z

Built in the same branch. Classing happens in team-sync before a never-synced copy's first connection (moves excluded). Older files are seeded with version 0, so the catch-up lands the team's version (deletes included). Only-here files go up; changed files go through today's set-aside. canvas.json is merged as before. Open question 3 is as on #193. Against an old cloud (404 or a malformed answer) the copy goes up blind as before; while spool.page is down the copy waits and retries (one-shot sync fails). The sheet's sentence follows here-setaside--copy.

### agent, 2026-10-21T18:31:11.449Z

Merged to spool main in 186487fe, using the seen lookup from spool-cloud main e28440f. Classes against every save the team still keeps (open question 3).
