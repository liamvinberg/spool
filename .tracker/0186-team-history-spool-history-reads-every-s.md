# #186 · Team history: spool history reads every save of a file

- State: closed (done)
- Labels: ready-for-agent
- Parent: #114
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:44.599Z
- Updated: 2026-10-21T21:31:44.381Z
- Closed: 2026-10-21T21:31:44.381Z

## Parent

Spec: team history, restore and backups (#114)

## What to build

The tracer through every layer, read-only: an agent runs `spool history <path>` on a team project and gets every save to that file for the team history's 90 days (who, which machine, when, applied or set aside), and `spool history <path> --at <time>` prints the file as it stood then. The sync object answers new read routes on the team project (every save to one path; the team's files and content hashes at a version, for paths or prefixes; bytes by content hash), open to any member, viewers included. The daemon reads them with the machine's device session; the verb prints and never writes. `spool skill` teaches it in the team-project section. The sync test harness's fake object answers the same reads. Glossary: Team history, Restore and Backup land in spool-cloud's from branch `108-wayfinder-dev-240` (3578d52), with Stretch and Epoch; core's gains Team history, Restore and Stretch, apart from its git History. Spans spool-cloud (object reads, routes) and spool (daemon, CLI, skill, harness).

## Acceptance criteria

- [ ] `spool history frames/x/frame.tsx` lists every save to it, newest first, each with person's name, machine, time and "set aside" where it was
- [ ] `--at <time>` prints the bytes the path had at the last save at or before that time, and says so when the file didn't exist then
- [ ] A save older than what the team history holds is not invented: the list ends where the log ends
- [ ] On a project that is not a team project the verb says its history is git's and exits non-zero
- [ ] A viewer's and an outsider's requests: viewers may read, outsiders are refused
- [ ] The routes' answers are bounded (paged), so a path with 100,000 saves answers in pages
- [ ] Worker tests cover the routes; core tests cover the verb against the harness; `spool skill` names the verb and that it is read-only
- [ ] Both glossaries updated as above

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T21:31:44.381Z

Built and merged in spool-cloud `6a89dc4` (merge 205 #114 team history, restore, 90-day purge, r2 backups and restore from a backup) and spool `68300b03` (merge 205 #114 team history: spool history, the history pane, restore and undo, compare with now). Cloud: GET …/history/saves, /files, /blobs/:hash for any member, viewers included (outsiders get 404). Spool: the daemon proxies them, and `spool history <path> [--at <time>]` is taught in the skill. Changeset: minor.
