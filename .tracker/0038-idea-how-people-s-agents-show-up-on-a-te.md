# #38 · Idea: how people's agents show up on a team canvas

- State: closed (done: teammates' agents show on the team canvas)
- Created: 2026-10-18T17:43:55.646Z
- Updated: 2026-10-22T18:33:39.952Z
- Closed: 2026-10-22T18:33:39.952Z

Taken out of the Spool Cloud for teams map on 2026-10-04: the first team version shows people only (live cursors and who's looking), and agent presence gets its own effort later.

What exists to start from:

- Research: presence, locks and feedback in multiplayer tools (#10).
- Three rounds of prototypes from Prototype people and agents on one canvas (#14). Round two is six animated takes under `design/frames/explore/cloud/presence/`. Round three is five designers working in isolation from different lenses: 15 takes, 84 frames under `design/frames/explore/cloud/presence-{places,work,territory,calm,wild}/`, each shown in the hard cases. Videos: <https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/presence-lenses/>
- Where round three converged, undecided: three lenses independently made a frame a room, with presence on frame names that keep their size at every zoom, pointers only inside a frame you're in, and one edge marker per off-screen place. The strongest pieces to fold in were work-caption (whose agent, and the ask), territory-edge (an agent waits at the block, people never wait) and a replay for coming back.

Nothing is decided.

*From Linear DEV-149.*

Related: #63, #65, #14, #10, #3

Plane: SPOOL-38

## Comments

### agent, 2026-10-22T18:33:39.952Z

Shipped outside this ticket: `2083e190` (presence: teammates see each other's agents at work, in their colour, 2026-10-09) and the merge `5e901fa2` (agent work on the frame's name row). Closed in agent-hub task 221.
