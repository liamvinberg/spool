# #58 · Decide how a broken sync is noticed and fixed, and members on different Spool versions

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:55.846Z
- Updated: 2026-10-18T17:43:58.604Z
- Closed: 2026-10-18T17:43:58.604Z

## Question

Offline work catching up on reconnect is decided, under the collision rule. What's open:

- **A broken sync.** How a member, or Spool itself, notices that a local copy has drifted from the team's copy: a relay that silently stopped, a daemon that was down while files changed, a watcher that missed an event, a local copy edited while the daemon was off. Whether the daemon reconciles its local copies against the team's copy on start and on reconnect, how it decides which side is newer, and what a person sees when it can't.
- **A member's own fix.** Whether there's a "make this match the team" action, and what it does to unsynced local changes.
- **Members on different Spool versions.** What happens when one member's daemon is older than the team's `FORMAT_VERSION` or the sync protocol: refused with an upgrade prompt, read-only, or held. How the cloud and the daemon agree on a protocol version, and whether the Mac app's auto-update covers it.
- **Operator side.** What the cloud alerts on (a sync object that never idles, limit failures), and how a team project's cloud copy is repaired.

Blocks the team project sync spec.

*From Linear DEV-172.*

Related: #72, #94, #107, #114, #117, #120, #57, #3

Plane: SPOOL-58

## Comments

### agent, 2026-10-18T17:43:58.596Z

**Liam, 2026-10-10:** ## Resolution (grilling with Cata, 2026-10-10, agent-hub task 110)

Cata took every recommendation, on one condition: nothing clutters. Sync shows nothing while it works.

- **Checking a local copy against the team.** Every time a daemon connects, after the catch-up, the sync object sends a fingerprint of the team's copy: one hash over every path and its content hash. The daemon compares it with its own. If they differ, it asks for the full list of paths and hashes and fixes only the files that differ. A copy whose record is lost takes the team's version and keeps its own differences as set-aside marks.
- **Dead connections.** No pong within 10 seconds of a ping counts as a dropped line. The daemon reconnects, which runs the check above. There is no scan on a timer: every reconnect and every wake from sleep checks.
- **What a person sees.** After 30 seconds without a connection, the Sync box says "Offline. Your changes go up when you're back." The line goes away when the connection comes back. A repair (drift) is silent for the person and reported to us. The Sync box still appears only when something is off.
- **Match the team.** One app action, no CLI command. It is in the project's menu, and in the Sync box when that is showing. Every local difference becomes a set-aside mark, so Put mine back still works, and the team's version is written. It does the same thing as the lost-record repair.
- **Members on an older Spool.** Sync is **paused**, not refused and not read-only. Files stay editable and changes stay on the Mac. The Sync box says "Update Spool to keep syncing with ", with the app's update button, or the npm command for the CLI. The cloud accepts the current protocol and the one before it, and is always deployed before the release that needs it. The update is not forced. Today a protocol refusal (4406) just retries in silence, and the team's format is recorded but nothing acts on it. Both change.
- **Format changes.** The first member who updates moves the team forward. Their daemon catches up, migrates, and sends the result as ordinary saves, which raises the team's format. Members still on the old format are paused until they update. For the spec: an updated daemon migrates its own unsent changes before they go up.
- **Alerts.** One alerts channel under the Spool category in Cata's Discord, fed by webhook. It works like Sentry: each message is something to fix. Sync's three: a sync object that never idles, Worker errors (Workers Issues groups repeats into one issue and notifies on a new one, or when one comes back after a quiet spell), and a new `team_sync_drift` line the object logs when a daemon reports a repair, which should never fire. It should be quiet on a normal day. The rest of the ops alerts from #94 go to the same channel.
- **Repairing a team's cloud copy.** Only we do it, with an admin command that restores the sync object from its backup (#57) and gives the team's copy a new identity, an epoch carried in `welcome`. Every daemon then runs the full check. Files on members' Macs that are newer than the restored copy go up as ordinary saves under the collision rule, so work saved after the backup comes back from whoever has it. A person's own mistakes stay with Restore (#57).

Glossary: **Drift** and **Paused** in `spool-cloud/GLOSSARY.md`, branch `110-wayfinder-dev-172` (f854836). "Paused" covers both limits and an old Spool. "Held" is avoided because core's code already uses it for files that didn't travel.
