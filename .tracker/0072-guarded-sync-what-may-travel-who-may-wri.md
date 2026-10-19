# #72 · Guarded sync: what may travel, who may write, limits, and ending

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Blocked by: #71
- Created: 2026-10-18T17:43:55.989Z
- Updated: 2026-10-18T17:43:59.172Z
- Closed: 2026-10-18T17:43:59.172Z

## Parent

#65

## What to build

Only Spool's own layout travels: `canvas.json`, `AGENTS.md`, `CLAUDE.md`, `frames/**`, `shared/**`; regular files only, no symlinks, modes or foreign dot-folders; 25 MB per file. The cloud checks on receipt and every receiving daemon checks again before writing. A file that didn't travel stays local and Spool shows it. The cloud refuses saves from viewers, removed members and revoked machines at once. Fair-use limits: 1 GB of `design/`, 120 saves per project a minute, 30,000 per editor a month; the daemon says why sync paused. The sync object hibernates and an alert fires when one never idles. When a team project ends for a machine (removed, made viewer, team deleted, project removed), the daemon stops syncing, restores the solo `design/.gitignore`, leaves `spool.json` and git alone, and shows "No longer synced with . This is now a project on this Mac only." `SECURITY.md` gains the team-project paragraph.

## Acceptance criteria

- [X] A symlink, `.git/config`, `.claude/settings.json` or a 26 MB file doesn't reach a teammate, and the sender sees it didn't travel
- [X] A forged cloud message writing outside the layout is refused by the receiving daemon
- [X] A viewer's, removed member's and revoked machine's saves are refused
- [X] Hitting a limit pauses sync with a reason and resumes when it lifts
- [X] Removal and role change turn the folder into an ordinary local project with the notice
- [X] `SECURITY.md` updated

## Blocked by

- #71

*From Linear DEV-187.*

Related: #83, #86, #58

Plane: SPOOL-72

## Comments

### agent, 2026-10-18T17:43:59.163Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0. 0.31.0 added what review found.

Decisions where the spec was silent:
- 30,000 saves a month are counted per editor per project.
- The sync state lasts. The canvas has a Sync section for paused, files that didn't travel, and ended. A Home cover says "no longer synced with ".
- Revoking a Mac, signing out or deleting the account cuts its sync at once, even when nobody saves.
- Rare messages are checked against the team every time. Pointer moves aren't, since that would be a database read per move. Revocation is pushed instead.
- Only a Mac's own session may sync. A browser session gets 403.
- The ending notice names the team by its address.
- An admin can remove a project through the API. There is no button yet.
- A copy that ended can be got again with Get it once you edit again.

Left:
- The "never idles" alert is only a log line and goes nowhere yet. Where it goes is part of #58 (Liam).
- Signing out in a browser doesn't cut that browser's presence until the next save. Small; not fixed.

Checks for Liam:
- [ ] Make an editor a viewer on spool.page/devosurf/people. Their canvas says "No longer synced with …" within a second or two.
- [ ] Revoke a Mac on /account while it has a team canvas open and nobody saves. Its daemon says it is signed out within seconds.
