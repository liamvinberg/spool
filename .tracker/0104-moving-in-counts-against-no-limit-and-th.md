# #104 · Moving in counts against no limit, and the minute limit becomes a bucket

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.361Z
- Updated: 2026-10-18T17:44:00.398Z
- Closed: 2026-10-18T17:44:00.398Z

## What to build

Decided in Decide how a big project gets into Spool Cloud (#83) (its resolution comment holds the why). Spans spool (`src/team-sync-protocol.ts`, `src/daemon/team-sync.ts`) and spool-cloud (`src/worker/sync/object.ts`, `limited()`).

- **Moving in is uncounted.** A move's saves count against neither `SAVES_PER_MINUTE` nor `SAVES_PER_MONTH` and are never refused by them, while the team project holds nothing but files from this move. An interrupted move run again is still uncounted. The 1 GB project and 25 MB file caps still apply. Files still travel one per message.
- **The minute limit is a bucket.** Per team project, everyone together: 2,000 saves, starting full, refilling at 120 a minute. Replace the sliding window (`SELECT at FROM saves ... OFFSET 119`) with a stored bucket (level and last refill time). `retryAfter` is the time until the next save fits.
- **The daemon waits instead of pausing on the minute limit.** `rate_limited` is no longer a "Sync paused" state: the daemon sends again after `retryAfter`, silently, and shows progress ("Sending 340 changes to , about 3 minutes") only when the wait passes about 10 seconds.
- **A heads-up at 80% of the month.** Said once per editor per project per month: "24,000 of 30,000 saves to this month". The monthly cap still pauses sync with the date it starts again.
- **Pacing, not refusals** (added by Decide what one busy project must hold at launch (#106)). The object tells daemons how full the bucket is, and a daemon holds its next save until it fits, so a whole file is never uploaded only to be refused. A retry after a refusal adds a random spread, so waiting daemons don't arrive together. Today at 200 agents that was 34 refused uploads per applied save.
- **We see a project stuck on its bucket.** The object logs `bucket_waiting` when a project has waited on its bucket for 10 minutes, for the alerts work, and a maintainer can raise one project's refill rate.

## Acceptance criteria

- [ ] Moving a 2,000-file project in goes through in one run, with no refusals, and leaves the mover's month count where it was
- [ ] A save into a team project holding a teammate's files is counted, even from a copy with no record of the team
- [ ] 2,000 saves in a burst go through; the next ones go at 2 a second
- [ ] A short minute-limit wait shows nothing; a long one shows progress, never "Sync paused"
- [ ] The 80% notice shows once, and the monthly cap still pauses with its date
- [ ] Research 254's save scripts at 200 agents: under one refused upload per applied save
- [ ] A maintainer raises one project's refill rate and that project's saves go faster
- [ ] Changeset for the published daemon change

*From Linear DEV-255.*

Related: #106, #117, #131, #103, #83

Plane: SPOOL-104

## Comments

### agent, 2026-10-18T17:44:00.387Z

**Liam, 2026-10-13:** Built in agent-hub task 146: spool 13969bae..153dbb3b (merged 3ba4522c, released in 0.41.0) and spool-cloud f54b2fe (merged 2dab3c5, deployed 2026-10-13). A move connects as moving and its saves skip the minute and month limits while the project holds only the move's files (the window closes at the first save that isn't the move's). The minute is a 2,000 bucket refilling at 120/min that paces daemons; `bucket_waiting` is logged after 10 minutes of waiting. Not done: the 200-agent load test against a deployed Worker.
