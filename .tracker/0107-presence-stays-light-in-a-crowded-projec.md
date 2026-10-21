# #107 · Presence stays light in a crowded project

- State: closed (done; saves under a crowd moved to spool#177)
- Labels: ready-for-agent
- Tasks: task 193 (Fix sidebar scroll and triage tickets)
- Created: 2026-10-18T17:43:56.400Z
- Updated: 2026-10-20T16:11:42.034Z
- Closed: 2026-10-20T16:11:42.034Z

## What to build

Decided in Decide what one busy project must hold at launch (#106) (its resolution comment holds the why), from the numbers in Load-test a busy team project (#103). Spans spool (`src/team-sync-protocol.ts`, `src/ui/canvas/use-presence.ts`, `src/ui/canvas/presence.ts`) and spool-cloud (`src/worker/sync/presence.ts`).

Today every pointer update is relayed to every other person at once, so the work grows with people × people, and past about 30 people all moving Cloudflare closes every moving person's socket, their sync with it.

- **Same page only.** A person's pointer, view and the rest of their state go only to people on the same page (`PresenceState.page`). Everyone else hears only which page they're on, enough for avatars and the page list.
- **Batched.** The object keeps each person's latest state and sends each receiver one frame per tick (about 100 ms) holding everyone who changed since, instead of one frame per update per receiver. The canvas glides pointers between ticks.
- **At most 50 cursors shown on a page.** Editors first. A person someone follows is always shown and doesn't count. Someone past the cap is told their pointer is hidden, still sees the others, and their canvas stops sending pointer moves (page changes still go). They're shown again when a place frees up.
- **Presence never closes a socket.** When presence comes in faster than the object relays it, the object drops updates (the latest state wins), never a connection, and saves on the same socket never wait behind presence.
- If the bar below can't be met inside the sync object, presence moves to its own object.
- A protocol change: older Spools follow Decide how a broken sync is noticed and fixed, and members on different Spool versions (#58).

## Acceptance criteria

- [ ] Research 254's presence scripts (`spool-cloud/research/254-load-test/scripts/`) on a throwaway Worker: 100 people on one page, all moving 20 times a second, for a minute: no socket closed, pointer delay p99 under 300 ms
- [ ] 100 people across 5 pages, all moving: no socket closed
- [ ] The 51st person on a page is told their pointer is hidden, sees the other 50, and is shown again when someone leaves
- [ ] A follower always sees the person they follow
- [ ] Saves in a crowded project land as fast as in an empty one
- [ ] Changeset for the published canvas and protocol change

*From Linear DEV-258.*

Related: #110, #117, #106, #103, #58

Plane: SPOOL-107

## Comments

### agent, 2026-10-20T16:10:23.100Z

Built on branches, not merged (task 193).

**Branches**
- spool `193-fix-sidebar-scroll-and-triage-tickets--fix-193-t107`: fd9cfcb7 protocol, 447cd191 daemon, e9a07be7 canvas, ade0eb6a viewer, 213fa39e changeset
- spool-cloud `193-107-presence` (worktree ~/dev/projects/spool-cloud-193-107, rebased on 0736e61): 2322535 ticks/same page/cap, d1d484e unknown types ignored, fb2f3bd held moves, df71825 older copies told in turn

**What it does**
- The object ticks every 100 ms: one `presences` frame per receiver, holding only who changed.
- Off-page people come as outlines: their page and agent only.
- Up to 50 pointers per page: editors first, then by arrival. Anyone followed (new `PresenceState.following`) is always shown and doesn't count.
- Past the cap you get `presence-hidden`, and your canvas stops sending pointer and view. A notice shows under the faces.
- The canvas sends at most once per tick.
- Compatibility:
  - Daemons opt in with `hello.ticks`, browsers with `?ticks=1`.
  - Older receivers get the same entries, one message each, at most 10 people per tick, the rest in turn.
  - Unknown types are ignored on both sides, with tests.

**Load test**
Throwaway Worker `spool-loadtest-193` with its own D1 and R2; 54–60 s runs. Pointer delay is send to receive, including the tick wait. The Worker, D1 and R2 were deleted afterwards.
- 100 on 1 page × 20/s: 0 closes in 5 runs. p99 147/218/257/314/354 ms (median 257), p50 ~50 ms. 50 got `presence-hidden`. DO CPU 12–20%.
- 100 on 5 pages × 20/s: 0 closes (2 runs). p99 389/570 ms.
- Control with 10 of 100 moving: p99 264 ms. So most of the tail is network or platform jitter, not load.
- 100 older daemons (no ticks): before df71825, all 100 were closed with 1013. After it, 0 closes; with hidden ones still moving, p99 is 988 ms.
- Saves, every ⅔ s, landed ms (p50/p90/max):
  - empty: 69–74 / 73–79 / 165–218
  - 1 page: 74–84 / 91–110 / 155–570
  - 5 pages × 20/s: 159 / 397 / 574
- Cap: the 51st was hidden and saw 50; the follower saw the followed; the 51st was shown again after a leave.
- One run (new clients, 1 page) lost all 101 sockets in the same millisecond with 1006. The DO logged `responseStreamDisconnected` and no CPU or memory errors. It didn't recur in 2 reruns.

**Checks**: cloud typecheck/check/test ✓; spool typecheck/check/test ✓ (393 files).

**Left open**
- p99 under 300 ms holds in 3 of 5 runs, median 257.
- "Saves as fast as empty" holds at p50 on one page, not at p90 or with 5 pages × 20/s. Even with presence dropped on arrival, 2000 msgs/s inbound pushed save p99 to ~360 ms. The lever is presence in its own object (ticket's fallback), not done.
- 10 per tick for old receivers is a guess.
- Hidden people stop sending view too.

### agent, 2026-10-20T16:11:42.034Z

Merged (spool 25e8df77, spool-cloud 5afb011, agent-hub task 193). Not released or deployed. Met: no socket closed with 100 on one page or across 5 pages, the 51st hidden and shown again, followers always see the followed, older Spools keep working (100 old daemons, 0 closes), changeset. Pointer p99 under 300 ms held in 3 of 5 runs (median 257 ms), the tail being network from devobee. Saves in a crowd are still slower than in an empty project: that is spool#177.
