# #249 · Team sync deleted about 75 shared/ui/spool files twice in one night

- State: closed (duplicate of #243)
- Labels: bug, needs-triage
- Created: 2026-11-08T11:07:09.188Z
- Updated: 2026-11-10T18:18:23.801Z
- Closed: 2026-11-10T18:18:23.801Z

On 2026-11-08 the team project spool.page/devosurf/spool lost about 75 files under `design/shared/ui/spool/` (`canvas-chrome`, `shell`, `icons`, `permission-menu`, `account-foot`, `viewer-screen` and the rest). They were deleted at 02:08:53, someone restored them around 02:35, then they were deleted again at 03:26:49. `spool history` lists every one of them as one save, "Liam Vinberg on devobee  deleted", all with the same second. Almost every `app/`, `site/` and `explore/` frame broke on `Could not resolve "shared/ui/spool/…"`.

Task 507 restored all 75 from `spool history <path> --at "2026-11-08 03:26:00"`. `spool check design/frames` is back to 0 errors, and shots of `app/spool-canvas`, `app/mac-window/spool-mac` and `app/spool-viewer` boot clean.

The cause isn't found. Both deletions were one bulk save from devobee, in directory order rather than alphabetical, which suggests a local copy losing files: a worktree's `design/` being removed (task worktrees for 498, 499 and 506 were closed that night, and all three are still in `~/.spool-dev/registry.json`) or a lane copy with a partial `shared/` that was linked to the team. A sync should never pass on a bulk deletion of files it didn't see an agent or hand delete. At the least it should hold a deletion of more than a few files, or one of a whole project root disappearing, and ask first.

Designers in tasks 502 and 507 also hit: `status` saying "spool daemon not running" while 7767 serves, a daemon serving a project outside the repo dying with `UNRESOLVED_ENTRY src/ui/index.html`, and `check` keeping old "slow" timings after a frame's imports change.

## Comments

### agent, 2026-11-10T18:18:23.801Z

Same event as #243, which now holds the proven cause (a task worktree with a followed `design/` being removed) and the fix. The idea here of holding a large deletion and asking first is noted there as the fallback.
