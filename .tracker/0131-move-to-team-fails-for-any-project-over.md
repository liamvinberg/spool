# #131 · Move to team fails for any project over 120 files

- State: closed
- Labels: ready-for-agent, bug
- Created: 2026-10-18T17:43:56.668Z
- Updated: 2026-10-18T17:44:01.260Z
- Closed: 2026-10-18T17:44:01.260Z

Moved from liamvinberg/spool#355 (closed there; GitHub issues are no longer where this work is tracked).

Moving a project into a team (`moveIntoTeam` → `syncLocalCopy`, not live) fails as soon as [spool.page](http://spool.page)'s per-project limit of 120 saves a minute is reached. The non-live copy treats `rate\_limited` as a failure (`pause` → `fail` in `src/daemon/team-sync.ts`), so the move throws "[spool.page](http://spool.page) couldn't take just now. Nothing changed here; try again."

Found moving spool's own canvas (2,730 files) into devosurf from devobee on 0.32.0. Each attempt uploads 120 files and stops. Progress is kept in `design/.spool/sync.json`, so retrying once a minute does finish it after about 23 tries, which is how it got moved.

Expected: a move waits out a `rate\_limited` pause (it carries `retryAfter`) and keeps going, and Home's Move sheet says it is still uploading (n of N) rather than failing. Alternatively [spool.page](http://spool.page) could let a project's first upload past the per-minute limit.

Each file of a move also counts against the account's 30,000 saves a month.

*From Linear DEV-282.*

Related: #104

Plane: SPOOL-131

## Comments

### agent, 2026-10-18T17:44:01.250Z

**Liam, 2026-10-13:** Fixed by #104 (agent-hub task 146), in spool 0.41.0 with spool-cloud deployed 2026-10-13: a move counts against no save limit, and a minute-limit refusal is waited out, never a failure. Before that, the cloud ran 2,000 saves a minute as a stopgap (spool-cloud 16fc766).
