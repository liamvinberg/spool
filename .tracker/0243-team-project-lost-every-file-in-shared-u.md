# #243 · Team project lost every file in shared/ui/spool twice in one night

- State: open
- Labels: bug, needs-triage
- Created: 2026-11-08T02:02:31.471Z
- Updated: 2026-11-08T02:02:31.471Z

Found by task 500's designer while adopting spool#238.

On 2026-11-08, saves from "Liam Vinberg on devobee" deleted every file in `shared/ui/spool/` of `spool.page/devosurf/spool` except `shares.tsx`, at 01:10:23 and again at 02:08:53 CET (see `pnpm -s dev history shared/ui/spool/canvas-path.tsx`). The deletions reached every worktree's copy. The designer restored about 135 files from the team history, to how they stood just before 02:08:53. A file nothing imports may still be missing.

Suspected, not proven: a worktree removed while a daemon still held its `design/` copy, so the removal was read as deletions and sent to the team. `~/.spool-dev/synced-copies.json` lists 43 copies, many in worktrees that no longer exist (498, 483, 452, 503), and the 7767 daemon's registry still lists 42 projects whose folders are gone. If that is the cause, it happens again whenever a worktree with a fetched `design/` is removed.

A folder disappearing should never become a delete on the team.
