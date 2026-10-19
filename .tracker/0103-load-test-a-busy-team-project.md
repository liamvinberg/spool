# #103 · Load-test a busy team project

- State: closed
- Labels: wayfinder:task
- Parent: #89
- Created: 2026-10-18T17:43:56.351Z
- Updated: 2026-10-18T17:44:00.361Z
- Closed: 2026-10-18T17:44:00.361Z

## Question

How many people and agents can one team project hold at once before something gives? Measure on the isolated beta: presence relayed to N people (each sends up to 20 updates a second; one object's soft limit is 1,000 incoming messages a second), saves from N agents against the 120-a-minute project limit, and a new editor's catch-up on a large project. Gives the numbers behind "no editor cap" in Decide what Spool Cloud costs and what stays free (#90) and feeds Decide how a big project gets into Spool Cloud (#83).

*From Linear DEV-254.*

Related: #104, #106, #107, #108, #109, #110, #94, #90, #83

Plane: SPOOL-103

## Comments

### agent, 2026-10-18T17:44:00.345Z

**Liam, 2026-10-10:** Decide how a big project gets into Spool Cloud (#83) set the minute limit to a per-project bucket of 2,000 saves refilling at 120 a minute, and moving in counts against no limit. Test those numbers: N agents against the bucket, and a 1 GB move in.

### agent, 2026-10-18T17:44:00.353Z

**Liam, 2026-10-10:** Done (agent-hub task 107, 2026-10-10). Report: `spool-cloud/research/254-load-test/README.md`, branch `107-dev-254-wayfinder` (42fed92, not yet on main). Measured on a throwaway copy of the app Worker built from main (b4f1e8f), not the beta: the beta runs older save code and minting sessions there meant replacing its AUTH\_HASH\_KEY. Torn down after.

**Presence breaks first.** One project relays about 20,000 presence messages a second. Past about 24,000, Cloudflare closes every sending socket with 1013 "Service overloaded", and their saves stop too, since presence rides the sync socket.
- Rule of thumb: keep (people moving) × (people − 1) under about 1,000.
- Held: 30 all moving (p99 183 ms), 60 with 18 moving, 100 with 10 moving.
- 35 all moving: nothing lost, but cursors lag (p50 172 ms).
- Thrown out within seconds: 40 all moving, 100 with 20 moving.
- It's the fan-out, not the 1,000/s soft limit: overload hit at 400–800 incoming a second. No CPU or memory errors; about 19 µs CPU per relayed message.

**Saves.** Replaying real agent turns, 120 a minute holds about 80 busy agents (roughly 16–20 people each running a fan-out of designers at once).
- 50 agents: p99 wait 6 s.
- 100 agents: median wait 3 s, p99 64 s.
- 200 agents: median wait 45 s, and the queue never drained.
- Decide how a big project gets into Spool Cloud (#83), decided the same day, makes the minute limit a bucket of 2,000 refilling at 120. That absorbs bursts, but not this sustained rate: at 100 agents the bucket lasts about 87 minutes, at 200 about 11.
- Refusals are costly: the whole file is uploaded before it's refused, and every daemon retries at the same retryAfter (28,544 refusals for 839 applied at 200 agents).

**Catch-up doesn't run out of memory; it blocks.**
- 990 MB caught up in 21 s; three new editors at once in 48–64 s. No errors.
- The object answers nobody while it reads: 0.4 s at 100 MB, 2.4 s at 500 MB, 5–6 s at 990 MB.
- A 500 MB+ join while people move closed every moving person's socket. At 100 MB (2,000 files), nobody was dropped.
- So #94's catch-up fix is about yielding between chunks, not about memory.

For "no editor cap" (#90): a team can still be any size. What one project can hold is about 30 people all active at once, or more if fewer are moving. Whether launch needs presence batching, a crowd limit or a non-blocking catch-up is now its own grilling ticket.
