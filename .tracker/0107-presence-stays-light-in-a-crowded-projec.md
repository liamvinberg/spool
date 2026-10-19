# #107 · Presence stays light in a crowded project

- State: open
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.400Z
- Updated: 2026-10-18T17:43:56.400Z

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
