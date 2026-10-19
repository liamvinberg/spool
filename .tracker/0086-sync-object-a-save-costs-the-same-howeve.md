# #86 · Sync object: a save costs the same however big the project is

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Created: 2026-10-18T17:43:56.147Z
- Updated: 2026-10-18T17:43:59.703Z
- Closed: 2026-10-18T17:43:59.703Z

## What to build

spool-cloud `src/worker/sync/object.ts`: every save runs `standings()` (an auth database read for every connected socket), then `limited()`, which counts the account's saves this month and sums the stored size of every file in the project (`SUM(length(b.bytes))` over files JOIN blobs) to check the 1 GB cap. A move of n files does that sum n times, so its work grows with n². Found while moving chamfer (1,922 files, 21 MB) into Devosurf on devobee, in agent-hub task 51 (chamfer project, thread "so can you move chamfer to spool cloud").

- Keep the project's held bytes as a running total, updated as files are saved and removed, and check the cap against it.
- Keep the account's month count as a counter rather than a COUNT over saves.
- Check standings once per connection and when told something changed (removal, role change, revoked machine), not on every save, keeping #72's rule that such saves are refused at once.

## Acceptance criteria

- [ ] The cap, month and minute checks answer from counters, with tests that they match the old queries
- [ ] Removing a member or revoking a machine still refuses its next save at once
- [ ] A benchmark of 2,000 saves into one project shows flat time per save

*From Linear DEV-235.*

Related: #72

Plane: SPOOL-86
