# #191 · Restore from a backup: a new epoch brings newer work back from members' Macs

- State: closed (done)
- Labels: ready-for-agent
- Parent: #114
- Blocked by: #190
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:44.720Z
- Updated: 2026-10-21T21:31:44.424Z
- Closed: 2026-10-21T21:31:44.424Z

## Parent

Spec: team history, restore and backups (#114)

## What to build

Spool restores a team project from a backup, and nothing saved since is lost. A maintainer-only route (beside the bucket's refill route) names a team project and a backup day. The sync object closes every socket, replaces its storage from the backup part by part, keeps its comment tables where they are still readable, records the head it restored to, and takes a new epoch, carried in `welcome`. The compile object drops its copy and reads the team's copy again, and browsers on the canvas reload. A daemon keeps the epoch per local copy; on a new one it asks for the team's paths and content hashes (the list #117's drift check will compare too: build it here if #117 hasn't) and, per difference: a path it last applied above the restored head, or with unsent local changes, goes up as an ordinary save on the team's version; any other difference takes the team's version. The collision rule settles two holders. A restore is logged for #117's alerts. Spans spool-cloud (route, object, compile object, protocol bump) and spool (protocol, daemon).

## Acceptance criteria

- [ ] In the team e2e: back up, save more from two daemons, restore the backup; afterwards the team's copy holds every save made since, once
- [ ] A daemon offline since before the backup takes the restored version and sends nothing old
- [ ] Two daemons holding the same newer file: it lands once, no set-aside mark
- [ ] A browser on the canvas and the compile object serve the restored copy, not stale frames
- [ ] Only the maintainer reaches the route; a team member gets 404
- [ ] Restoring a 1 GB backup keeps memory flat
- [ ] An older daemon without epochs still connects (current and previous protocol accepted)
- [ ] Run once against a deployed staging object, and the steps written in the operator docs

## Blocked by

- #190

## Comments

### agent, 2026-10-21T21:31:44.424Z

Built and merged in spool-cloud `6a89dc4` (merge 205 #114 team history, restore, 90-day purge, r2 backups and restore from a backup) and spool `f81fed9f` (merge 205 #114 restore from a backup: a copy settles with a new epoch). Cloud: maintainer-only GET/POST /internal/teams/:address/projects/:project/backups|restore; rebuild keeps today's comment tables and never moves version counters back; a new epoch and restoredHead in the welcome; the compile object reloads and watching browsers get the new head; a project_restored alert; operator steps in docs/operators.md. Spool: the copy keeps the epoch; on a new one it lists the team's copy (#117's list) and sends what it holds above the restored head or unsent, and takes the team's version for the rest. Harness tests cover two holders landing once with no mark, an offline copy, an unsent change and a fresh fetch. Changeset: patch. Outstanding (human): run one restore against a deployed staging object.
