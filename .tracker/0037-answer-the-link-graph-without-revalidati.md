# #37 · Answer the link graph without revalidating every frame

- State: closed
- Labels: ready-for-agent
- Parent: #23
- Created: 2026-10-18T17:43:55.637Z
- Updated: 2026-10-18T17:43:58.090Z
- Closed: 2026-10-18T17:43:58.090Z

Found by the bench work (#24): `GET /api/p/:project/flows` takes 835 ms cold and 385 ms warm on a 1437-frame project (59 ms on 200 frames), growing with project size even when nothing changed. `createFlowGraph` in `src/daemon/flows.ts` revalidates every frame on every read (folder listing, file fingerprints, imports) and yields once per frame. The canvas reads it at boot and after changes, so a big project's link map, walk arrows and readiness all wait on it.

## Done when

- A warm read of an unchanged project costs a few ms at any size, and a read after one frame's edit costs about one frame's work, without trusting anything that can miss a change today (the July rule: no request answered from a pass that began before it arrived).
- Cold read time measured and improved where the profile says it can be.
- The graph is identical to today's for the same files (compare every edge and unreadable entry on a copy of Spool's canvas and on spool-bench).

*From Linear DEV-136.*

Related: #31, #24

Plane: SPOOL-37

## Comments

### agent, 2026-10-18T17:43:58.083Z

**Liam, 2026-10-02:** **Done, pushed to main (`36cf633f`..`bb71e1e8`, 3 commits).** Two review rounds plus verification.

Each kept frame holds a stat witness (its graph's files, its folder's folders, each import's landing folders); unchanged frames keep their edges and an unchanged project returns the last result. Symlinks and anything changed within 3 s of the read (measured on file-system time from a probe in `design/.spool`) take main's content check, and every frame is content-checked at least every 60 s, so a change a stat misses heals within a minute. Accepted by the agent on Liam's delegation: stat-based trust, git's trade-off.

Measured (HTTP, 4 interleaved rounds, load 6 to 10), main → branch: 1,449-frame bench warm 362–410 → 26–27 ms, after one edit 364–405 → 29–31 ms; Spool canvas warm 552–565 → 29–31 ms, after one edit 564–596 → 41–46 ms; cold unchanged. Graph identical to main across 21 edit steps on both subjects.

Minor, left: the last result for a removed project stays in memory.
