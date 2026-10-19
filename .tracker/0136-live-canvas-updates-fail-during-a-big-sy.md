# #136 · Live canvas updates fail during a big sync: subrequest depth limit in team_watch

- State: open
- Labels: ready-for-agent, bug
- Created: 2026-10-18T17:43:56.728Z
- Updated: 2026-10-18T17:44:01.455Z

Seen in production on 2026-10-13 from 13:46 UTC while Liam moved a project into devosurf (agent-hub task 146), on both the previous and the current Worker version. One sync object (`01a18b03…`) logged \~1,500 `team_watch` errors in 25 minutes, one per save:

> Error: Subrequest depth limit exceeded. This request looped back into the Workers runtime too many times.

Every `TeamProjectSync.changes` RPC from the compile object failed with it. The path: a save → `tellWatchers` → `tellCompile` (`src/worker/sync/object.ts`), which chains every tell onto `this.telling` → `compile.saved` → `frames/source.ts` calls `sync.changes(since)` back on the sync object. Likely the ever-growing `this.telling` chain carries one request's context into the next, so the depth adds up under a stream of saves.

Effect: the save itself lands (the failure is only logged), but browsers watching the canvas and the compile object's copy don't hear those saves, so the live canvas and shares lag or go stale during a move or any burst.

*From Linear DEV-287.*

Plane: SPOOL-136

## Comments

### agent, 2026-10-18T17:44:01.455Z

**Liam, 2026-10-14:** Fixed in spool-cloud main (65274e0, merged 2ab87e3), NOT deployed yet. The sync object queues saves in an unheard table and hands them to the compile object from its alarm in batches (compile.heard), so no call chains below an open request. After deploy: team\_watch/team\_turn errors should stop during a burst.
