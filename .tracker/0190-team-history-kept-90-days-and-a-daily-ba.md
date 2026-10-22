# #190 · Team history kept 90 days, and a daily backup to R2

- State: closed (done)
- Labels: ready-for-agent
- Parent: #114
- Blocked by: #187
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:44.694Z
- Updated: 2026-10-21T21:31:44.416Z
- Closed: 2026-10-21T21:31:44.416Z

## Parent

Spec: team history, restore and backups (#114)

## What to build

The team history kept 90 days, and a backup kept 30. A daily pass reaches every live team project's sync object, spread across the five-minute cron's ticks so each tick stays inside the subrequest limit and each object is visited about once a day. The purge deletes saves older than 90 days, applied or set aside (closing #73's last criterion), except the save that made each current file; then the blobs nothing remaining references, and the edit-beats-delete notices whose save is gone. The move-in record survives in the object's meta. The backup copies every table of the object to a new R2 bucket in the EU jurisdiction, part by part (1 MiB) so memory stays flat: blobs once by content hash, shared across days, plus a manifest per day for the rest; skipped when nothing changed since the last; manifests older than 30 days deleted except a live project's newest; unreferenced backup blobs deleted; a purged team's manifests all age out. Failures are logged as lines #117's alerts can watch. spool-cloud only.

## Acceptance criteria

- [ ] With the clock moved 91 days, older saves are gone from every history read; current files and their bytes are untouched; a file untouched for a year is still served
- [ ] A canvas.json save whose base was purged still merges, as a save with no base
- [ ] Blob storage shrinks by the bytes only purged saves held
- [ ] A 1 GB project backs up without the object's memory growing with its size
- [ ] A second backup the same day with no change writes nothing; a quiet project keeps its newest backup past 30 days
- [ ] A manifest plus its blobs is enough to rebuild the object's tables exactly (tested by reading one back)
- [ ] The pass visits each project about once a day across ticks and never more subrequests a tick than the limit
- [ ] The bucket is declared in wrangler for production and test, and created
- [ ] Worker tests with an injected clock and the pool's local R2

## Blocked by

- #187

## Comments

### agent, 2026-10-21T21:31:44.416Z

Built and merged in spool-cloud `6a89dc4` (merge 205 #114 team history, restore, 90-day purge, r2 backups and restore from a backup). A 90-day purge that keeps each current file's save, collects unused blobs and drops restores. A daily R2 backup (TEAM_BACKUPS, EU jurisdiction, in parts of about 1 MiB) that skips unchanged projects, keeps 30 days plus a live project's newest, and lets gone projects age out. The daily pass is spread over the */5 ticks within DAILY_PASS_SUBREQUESTS=300. Failures are logged as backup_failed/purge_failed alerts. Human step: create the buckets before deploying: `npx wrangler r2 bucket create spool-team-backups --jurisdiction eu` and `npx wrangler r2 bucket create spool-team-backups-beta-test --jurisdiction eu`.
