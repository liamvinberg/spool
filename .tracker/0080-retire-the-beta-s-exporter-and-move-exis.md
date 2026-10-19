# #80 · Retire the beta's exporter and move existing publications

- State: closed
- Labels: ready-for-agent
- Blocked by: #59, #78
- Created: 2026-10-18T17:43:56.072Z
- Updated: 2026-10-18T17:43:59.488Z
- Closed: 2026-10-18T17:43:59.488Z

## Parent

#62

## What to build

Sharing now compiles in the cloud, so the beta's second pipeline goes: the local exporter, the navigation check before export, and the required `links` export (`links` may stay as an optional hint for arrows). Every beta publication is already stopped (all 11 were Cata's, in the beta environment; production has none), so nothing moves: delete the beta's publication data (the publication tables in `spool-cloud-beta-test` and the `spool-publications-beta-test` bucket) and drop the publication code. `spool cloud publish`, `stop`, `list`, `status`, `invite` and `revoke` go with no deprecation release. See Decide what happens to the beta's publications and links (#59).

## Acceptance criteria

- [ ] No frame is refused at share time
- [ ] The exporter and navigation check are removed from core with a changeset
- [ ] The beta's publication data and the `spool cloud` publication verbs are gone
- [ ] Publication, publication version, publication visit, publisher and invited viewer leave the glossary

## Blocked by

- #78
- #59

*From Linear DEV-195.*

Related: #88, #62, #3

Plane: SPOOL-80

## Comments

### agent, 2026-10-18T17:43:59.468Z

**Liam, 2026-10-13:** Code side built in agent-hub task 146: spool 3862eab9 and spool-cloud f3e98b4 on main (breaking minor changeset in spool). Not deployed; spool-cloud deploys by hand with `pnpm deploy`.

Left, by hand in Cloudflare (nothing deleted yet):
1. The recovery Worker `spool-cloud-beta-recovery`, its domain `beta-recovery.spool.page`, its D1 `spool-cloud-beta-recovery` and R2 `spool-publications-beta-recovery`.
2. Empty R2 `spool-publications-beta-test` (keep the bucket while the binding exists).
3. First, in D1 `spool-cloud-beta-test` and production `spool-cloud-auth`: drop every `recovery_*` trigger, plus `recovery_storage_quota`, `invalidate_superseded_publication_operations` and `suspend_publications_on_approval_removal` (some sit on account and team tables and abort writes once their tables go).
4. Then drop the tables: publication\_recovery\_control (+ \_publications, \_objects, *records); publications, publication\_invitations and the publication*\* operations, grant\_operations, manifest\_chunks, objects, object\_storage, upload\_objects, versions, version\_objects, browser\_transactions, handoffs, sessions, visits, cleanup\_inventory, cleanup\_runs; publisher\_approvals, publishers, publisher\_sessions, publisher\_handoffs, oauth\_requests, pending\_admissions; viewer\_identities, viewer\_sessions, viewer\_attempts.

### agent, 2026-10-18T17:43:59.479Z

**Liam, 2026-10-13:** Finished in agent-hub task 146 (2026-10-13):
- spool-cloud main deployed to production (app and serving Workers), with migration 0029 (project moves, never applied before) and 0030.
- 0030\_retire\_publications.sql (spool-cloud 418f873) drops the recovery triggers, then the publication, publisher and viewer tables; applied to spool-cloud-auth and spool-cloud-beta-test. Time Travel bookmarks before: auth 000005b5-00000018-00005103-624401fd5391b44101b5c74bd00f3529, beta-test 00001ed7-0000000c-00005103-ad5be92e8d5feef659b65aae7c009565.
- Deleted the spool-cloud-beta-recovery Worker (and beta-recovery.spool.page), its D1 and the spool-publications-beta-recovery bucket.
- spool-publications-beta-test (543 objects, 7 MB) empties itself through a 1-day expiry lifecycle rule; the bucket stays while the binding does.
New auth migrations must not add recovery\_\* triggers any more: publication\_recovery\_control is gone.
