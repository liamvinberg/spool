# #83 · Decide how a big project gets into Spool Cloud: bulk upload and the save limits

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:56.110Z
- Updated: 2026-10-18T17:43:59.599Z
- Closed: 2026-10-18T17:43:59.599Z

## Question

Found while moving chamfer (1,922 files, 21 MB) into Devosurf on devobee, in agent-hub task 51 (chamfer project, thread "so can you move chamfer to spool cloud"). Every file is one save, and a team project takes 120 saves a minute from everyone together (#72), so the move took 16 tries over about 20 minutes. It also spent 1,922 of Liam's 30,000 saves for the month on files that already existed.

To decide:

- Whether a move's first upload, or a fetch-and-catch-up after long offline work, travels as batches that count once, or not at all, against the per-minute and monthly limits.
- Whether 120 a minute is the right number once the server is cheaper per save (see the ready-for-agent ticket on per-save cost), or whether it becomes a burst allowance (say a bucket of a few thousand that refills at 120 a minute). An agent writing 40 frames in one turn also pushes against it.
- Whether the monthly limit counts saves or bytes, given #42's cost research.

Evidence: `src/daemon/team-sync.ts` (LIMITS, pause), `src/team-sync-protocol.ts` (SAVES\_PER\_MINUTE, SAVES\_PER\_MONTH), spool-cloud `src/worker/sync/object.ts` (`limited`).

*From Linear DEV-232.*

Related: #103, #104, #106, #72, #42, #3

Plane: SPOOL-83

## Comments

### agent, 2026-10-18T17:43:59.590Z

**Liam, 2026-10-10:** ## Resolution

Grilled with Cata (agent-hub task 106). He took all three recommendations and left the rest to best practice, decided below.

**1. Moving in counts against no limit.**
- A move's upload counts against neither the minute limit nor the monthly one, and isn't refused by them.
- It is allowed only while the team project holds nothing but this move's own files: from the first file of the move until the mover's copy is caught up. An interrupted move that runs again is still a move, since nothing else is in the project yet.
- The 1 GB project cap and the 25 MB file cap still apply. This is what keeps it safe: an empty project can only be moved into once, so a runaway agent can't use it again and again.
- No batch message. Files still go one per message, as now, which keeps memory per message small in the sync object.
- What the person sees: the move counts its files up ("Moving in: 812 of 1,922 files"), and never pauses on a limit.

**2. The minute limit becomes a bucket.**
- Per team project, from everyone together, as now: a bucket of **2,000 saves** that starts full and refills at **120 a minute** (2 a second).
- An agent writing 40 frames, a teammate catching up after a week offline, or several agents at once go through without stopping. A runaway agent still settles at 120 a minute. The busiest real minute in research 117 was 26 saves.
- Catch-up after offline work needs nothing special: only the latest version of each changed file goes up, and the bucket takes it.
- What the person sees: running out of bucket is a short wait, not an error. The daemon sends at the refill rate without saying anything. Only a wait longer than about 10 seconds shows, as progress ("Sending 340 changes to devosurf, about 3 minutes"), not as "Sync paused".
- **Load-test a busy team project** tests these two numbers and may tune them.

**3. The month counts saves, not bytes.**
- 30,000 saves per editor per project per UTC month, as now. Saves are what cost money (the request and the compile). Bytes already have their own caps (1 GB of `design/`, 5 GB of history), so a byte meter would add nothing.
- Moving in doesn't count (1).
- What the person sees: one notice at 80% ("24,000 of 30,000 saves to chamfer this month"), and at the cap, sync pauses with the date it starts again, as now.

Build: **Moving in counts against no limit, and the minute limit becomes a bucket** (linked).
