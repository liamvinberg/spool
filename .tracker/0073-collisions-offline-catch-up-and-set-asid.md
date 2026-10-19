# #73 · Collisions, offline catch-up and set-aside marks

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Blocked by: #71
- Created: 2026-10-18T17:43:56.000Z
- Updated: 2026-10-18T17:43:59.224Z
- Closed: 2026-10-18T17:43:59.224Z

## Parent

#65

## What to build

No locks. Saves carry the version they were built on. A save built on a version the cloud has moved past is set aside: stored in the team's history, never applied, and the writer's disk takes the team's version. An edit beats a delete (the file comes back for everyone and the deleter is told); a losing rename leaves the old path beside the new one; `canvas.json` merges key by key with last write per key winning and no notice. Offline saves queue and catch up on reconnect, so coming back never rolls the team back. The writer whose save was set aside gets a mark on each frame that renders the file ("your change was set aside, Ben's arrived first") with Compare, Put mine back (an ordinary new save) and Hand to agent (a turn started only on press). Many at once after offline show one summary. The winner isn't told.

## Acceptance criteria

- [X] In the harness, two saves to one file built on the same version: the first stands, the second is set aside and its machine's file becomes the team's version
- [X] Edit beats delete; a losing rename leaves the old path
- [X] Two `canvas.json` changes to different keys both land
- [X] Offline saves catch up without overwriting teammates' newer work
- [X] The mark shows on every frame rendering the file; each of the three actions works; nothing reaches an agent without a press
- [ ] Retention of set-aside saves follows #57 once decided

## Blocked by

- #71

*From Linear DEV-188.*

Related: #114, #57, #3

Plane: SPOOL-73

## Comments

### agent, 2026-10-18T17:43:59.204Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0. Everything works except how long set-aside saves are kept, which waits on #57. So this stays In Progress.

Decisions where the spec was silent:
- A fourth action, Dismiss, keeps the team's version and clears the mark.
- More than 3 set aside at once make one summary.
- Names are email addresses until accounts have display names.
- Hand to agent sends the file paths to the open thread, behind a running turn.
- The deleter is told with a "restored" mark that has the same actions.
- This Mac keeps its set-aside copies in .spool/set-aside until the mark goes.

Waiting on Liam: decide #57. Then the sync object needs a purge for set-aside saves and restores, and Compare can show older versions. Today nothing is ever purged.

### agent, 2026-10-18T17:43:59.211Z

**Liam, 2026-10-10:** Decide history and restore for team projects (#57) is decided: every save, set-aside ones included, is kept 90 days and then deleted, and the current files never are. The purge can be built from that.

### agent, 2026-10-18T17:43:59.217Z

**Liam, 2026-10-11:** Closed on 2026-10-11 (agent-hub task 123): everything is built but the retention of set-aside saves, which moves to Spec: team history, restore and backups (#114) (kept as long as history, 90 days, per Decide history and restore for team projects (#57)).
