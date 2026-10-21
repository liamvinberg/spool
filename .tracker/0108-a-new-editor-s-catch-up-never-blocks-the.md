# #108 · A new editor's catch-up never blocks the project

- State: closed (done, merged in spool-cloud 0736e61)
- Labels: ready-for-agent
- Tasks: task 193 (Fix sidebar scroll and triage tickets)
- Created: 2026-10-18T17:43:56.410Z
- Updated: 2026-10-20T15:41:26.755Z
- Closed: 2026-10-20T15:41:26.755Z

## What to build

Decided in Decide what one busy project must hold at launch (#106). The catch-up fix Research: running Spool Cloud for paying customers on Cloudflare (#94) made a must-have before taking money; Load-test a busy team project (#103) showed it is about blocking, not memory. spool-cloud, `hello` in `src/worker/sync/object.ts`.

Today `hello` reads every file of the project in one synchronous handler, so the object answers nobody for 2.4 s at 500 MB and 5 to 6 s at 990 MB, and a 500 MB+ join closes every moving person's socket.

- The welcome goes first, then the files in chunks of a few MB, yielding between chunks so the object answers everyone else meanwhile.
- Several new editors joining at once take turns chunk by chunk, so one big join doesn't starve the others.

## Acceptance criteria

- [ ] Research 254's catch-up scripts on a throwaway Worker: a new editor joins a 990 MB project while 10 people move their pointers: nobody is dropped, presence p99 stays under 300 ms, and others' saves land within 1 s
- [ ] Three new editors joining a 990 MB project at once all reach caught-up
- [ ] The existing catch-up tests still pass

*From Linear DEV-259.*

Related: #106, #103, #94

Plane: SPOOL-108

## Comments

### agent, 2026-10-20T15:40:23.335Z

**Built (spool-cloud, branch `193-fix-sidebar-scroll-and-triage-tickets--fix-193-t108`, not merged):**
- `fb06834` blob-parts: read a blob a few parts at a time
- `3c08b65` sync: catch a new editor up in paced chunks, joins taking turns

`hello` now sends the welcome and hands the catch-up to `CatchUps` (new `src/worker/sync/catch-up.ts`). Each turn reads up to 2 MB of blob parts for one joiner, then waits (≥1 ms, paced to 50 MB/s) before the next joiner's turn. A file is read across turns into its one `file` frame and sent whole, so the wire is unchanged. The cursor is "files with version > newest sent, oldest first", so a save that lands mid catch-up arrives in order, newest version only. caught-up/live is set in the same synchronous step as the last empty read. A closed or cut socket stops on its next turn, and `webSocketClose`/`webSocketError` also drop it. `catchingUp()` RPC reports how many are running.

**Measured** on throwaway `spool-loadtest-108` (own D1/R2/DOs, 990 MB = 99 × 10 MB, ARN). It is deleted now, with its D1, R2 and DO namespaces:
- 990 MB join while 10 people move (20/s): **0 dropped, 100% delivered, presence p99 68 ms** (before: all 10 dropped). Welcome after 24–57 ms (before: 5.3 s). Caught up in 20 s (same as before).
- The same, plus 3 teammates saving 6 times a second: 0 dropped. Saves max 450 / 530 ms (all under 1 s). Presence p99 266 / 368 ms over two runs. Without any join, the same saves alone gave p99 281 / 361 ms. So presence past 300 ms comes from the saves themselves (to look at with #107), not from the join.
- Three 990 MB joins at once, 10 people moving: **all caught up** in 58.7–58.9 s (before: 48–64 s, and one waited 12.6 s just to open). Welcome in ≤28 ms, presence p99 92 ms, 0 dropped.
- Note: `setTimeout(0)` was not enough on Cloudflare. Other sockets' messages were not delivered until the catch-up finished (saves waited 5 s). An unpaced 1 ms wait still stalled saves 1–3 s. Pacing plus part-sized turns fixed it.

**Tests:** new `catch-up.worker.test.ts`, 6 tests: welcome first and a teammate's save answered before caught-up; a file bigger than a chunk sent byte for byte, plus an empty file and a delete; three joins interleaved; an old Spool (hello without bundles) hears only welcome/file/caught-up, and saves that land mid catch-up arrive with versions strictly ascending; a closed joiner's catch-up stops. The unchunked code fails 3 of them.

**Checks:** spool-cloud typecheck ✓, check ✓ (0 errors), test ✓ (73 + 306 + node). spool unchanged: its daemon writes each `file` as it comes and ignores unknown messages, so it needs nothing.

**Left open / decided:** the chunk size (2 MB) and the pacing rate (50 MB/s across all joiners) are fixed constants. Cloud still closes a socket that sends an unknown message type (it did before this change). This change adds nothing new to the wire. origin/main hadn't moved, so there was no rebase. When 191 merges, `caughtUp` will need its `await this.sendComments`: make the CatchUps callback allow a promise.

### agent, 2026-10-20T15:41:26.755Z

Merged to spool-cloud main (0736e61, agent-hub task 193). Not deployed yet. Every criterion met; presence p99 went past 300 ms in one of two runs with 3 teammates saving, but the same saves without a join push it as high, so that lag is #107's, not the catch-up's.
