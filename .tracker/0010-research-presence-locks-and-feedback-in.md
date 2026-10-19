# #10 · Research: presence, locks and feedback in multiplayer tools

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.388Z
- Updated: 2026-10-18T17:43:57.319Z
- Closed: 2026-10-18T17:43:57.319Z

## Question

How do multiplayer tools show who is doing what, people and AI agents alike; how do they stop two writers clobbering the same thing; and how do outsiders give feedback? Cursors, avatars, follow mode and "who is in which frame" (Figma, tldraw, Linear, Zed, Liveblocks); agents as participants and how concurrent agents avoid the same files; locks versus last-write-wins versus merging in practice, including why Abstract for Sketch died; comments and review from people without accounts. Plus what Spool's own agent presence carries today and which parts assume one machine.

Report: `spool-cloud/research/109-presence-locks-feedback/`.

*From Linear DEV-109.*

Related: #38, #63

Plane: SPOOL-10

## Comments

### agent, 2026-10-18T17:43:57.314Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/109-presence-locks-feedback/` (commit `68bb55c`), 83 evidence files.

- Presence is a small record per connection that is broadcast, not stored. tldraw sends 30 updates a second and Liveblocks 10 by default; idle timers run 3 to 60 seconds. Liveblocks caps a room at 10 to 100 connections by plan. On Durable Objects, incoming WebSocket messages bill at 20 to 1, and in Cloudflare's own example almost all the cost is connection time.
- Other people mostly see agents through status lists and boards (Linear sessions, Replit's task board, Claude Code's agent view), not cursors. The spatial exceptions are tldraw's fairies, removed after about a month, and Zed's "follow the agent".
- Documented ways to keep agents from clobbering each other: separate copies (worktrees, VMs), claiming a task rather than a file, assigning files that don't overlap, and a check at write time. Cursor reports file locks cut 20 agents to the throughput of 2 or 3, and Anthropic's compiler write-up shows agents overwriting each other on one shared task.
- Exclusive locks (Perforce, Unity Version Control, Git LFS) are used for files that can't be merged. Figma takes the last write per property, Google Docs merges with operational transforms, Notion does neither.
- Outsider feedback: Figma, Vercel, Chromatic and Loom's share page need an account; BugHerd, Marker.io guests and embedded Loom don't.
- Spool today: the agent hand carries no identity. It is one hand, drawn from the one agent thread open in that window, over an event stream held in the daemon's memory. Selection, agent turns, the file watcher and history are all per machine. Parallel agent threads already share one checkout with no lock. Canvas edits check a fingerprint of the file at write time; geometry and agent writes don't. Spool Cloud has no comments, presence or Durable Objects yet.

Unverified: why Abstract shut down (pages didn't load), several products' cursor rates, how teammates see Figma's and Notion's agents live.
