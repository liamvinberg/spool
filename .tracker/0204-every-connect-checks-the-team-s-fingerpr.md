# #204 · Every connect checks the team's fingerprint and repairs drift silently

- State: closed
- Labels: ready-for-agent
- Parent: #117
- Blocked by: #202
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:56:11.332Z
- Updated: 2026-10-21T20:57:19.977Z
- Closed: 2026-10-21T20:57:19.977Z

## Parent

Spec: running Spool Cloud for paying teams (#117)

## What to build

Every connect checks the local copy against the team's copy and silently repairs Drift. The protocol gains one shared fingerprint function: one hash over every path, sorted, each with its content hash, deletes left out. It also gains the opt-in `hello.checks`. With it, after `caught-up` the sync object sends `fingerprint`. If the daemon's differs, it sends `list` and gets every path, version and hash, paged. It then asks for the differing paths with `resend` and writes them by the catch-up's rules, so unsent local changes stay and go up under the collision rule. It reports `drift` with counts and cause (never paths), and the object logs `team_sync_drift`, which the ops script alerts on. A local copy whose sync record is lost takes the team's version and keeps each local difference as a set-aside mark (scoped by #117 open question 1). That repair is one daemon operation, which Match the team reuses. The **Drift** entry lands in spool-cloud's glossary from branch `110-wayfinder-dev-172`. Spans spool (protocol, daemon team sync, test harness) and spool-cloud (sync object, the e2e).

## Acceptance criteria

- [ ] e2e: a teammate's save the relay dropped for one daemon is written there on its next connect, with no notice shown
- [ ] e2e: a file changed on disk behind the daemon's back (record says otherwise) is put right on the next connect
- [ ] e2e: a local copy whose `sync.json` is deleted while its link stays ends up with the team's version, and each local difference is a set-aside mark that Put mine back restores
- [ ] A local change not yet sent is never overwritten by the repair, and goes up as a save
- [ ] A copy that matches costs one fingerprint message, with no list
- [ ] `team_sync_drift` is logged with counts and cause, and posts to the alerts channel
- [ ] An older daemon without `checks` and an older object without `fingerprint` both work as before
- [ ] Glossary: Drift lands
- [ ] Changeset for the published daemon and protocol change

## Blocked by

- #202

## Comments

### agent, 2026-10-21T18:01:53.154Z

Lost-record rule (open question 1, taken as the spec recommends): a local copy takes the team's version and keeps each local difference as a set-aside mark **only when this machine knows the copy synced before**. That knowledge is machine-level, `<spoolDir>/synced-copies.json` (root → project URL, written on every live caught-up), so it survives a deleted `design/.spool/`. A lost record = the copy is followed live, `design/.spool/sync.json` is missing or names another project, and synced-copies says it synced before. A copy this machine never synced keeps the Get it rule (#96) unchanged. The match only runs when the object's welcome said `checks`, so an older spool.page keeps today's behaviour. While unmatched, the record carries `unmatched: true` so a restart before the match still holds sends back. With no record, a file deleted locally can't be told from one never had: it comes back from the team, unmarked (edits and additions are marked).

### agent, 2026-10-21T20:57:19.977Z

Merged: spool f5fe825d (merge 205 #117 …), spool-cloud 4bf3938 (merge 205 #117 …). Built: copyFingerprint in spool's protocol (mirrored in spool-cloud src/worker/sync/checks.ts until the pin moves), hello.checks, fingerprint/list/listed/drift, listFiles(sql, after, limit) reusable for team history, silent repair on every connect, lost-record repair per open question 1, team_sync_drift log line, Drift glossary, changeset. e2e drift.test.ts passes.
