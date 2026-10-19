# #85 · A move waits out a sync pause, shows progress and says what stopped it

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Created: 2026-10-18T17:43:56.136Z
- Updated: 2026-10-18T17:43:59.677Z
- Closed: 2026-10-18T17:43:59.677Z

## What to build

Found while moving chamfer (1,922 files, 21 MB) into Devosurf on devobee, in agent-hub task 51 (chamfer project, thread "so can you move chamfer to spool cloud"). `moveIntoTeam` runs `syncLocalCopy` with `live: false`, and a not-live copy fails on any pause (`if (!live) fail(...)` in `pause`). A project over 120 files therefore always fails the first try with "[spool.page](http://spool.page) couldn't take just now. Nothing changed here; try again.", hiding the reason. Each retry gets 120 more files up, since `moving.json` and `sync.json` remember progress.

- A move treats `rate_limited` (and `unavailable`) as a wait: it sleeps for `retryAfter` and carries on, until every file is confirmed. `project_full` and `monthly_limit` still stop it, named plainly.
- The move sheet shows progress (files up of files total) and, while paused, why and for how long.
- A failure names its cause instead of "just now".

## Acceptance criteria

- [ ] Moving a project with 500 files against a cloud limited to 120 saves a minute succeeds in one action, with no retry
- [ ] The move sheet shows files up of total, and the pause with its reason
- [ ] A move stopped by `project_full` or `monthly_limit` says so

*From Linear DEV-234.*

Plane: SPOOL-85
