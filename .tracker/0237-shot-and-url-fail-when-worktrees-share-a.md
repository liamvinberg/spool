# #237 · shot and url fail when worktrees share a folder name

- State: open
- Labels: bug, needs-triage
- Created: 2026-11-07T11:50:13.917Z
- Updated: 2026-11-07T11:50:13.917Z

`spool shot` and `spool url` look the project up by its folder's name, even when run inside its registered root. Every room worktree registers `engine/` (devosurf/room), so with several open they fail with `"engine" names 6 registered projects:` (and 409 `"engine" names multiple registered projects` on a frame URL). Designers in room task 476 had to copy frames into a temporary `spool init --local` project to shoot.

Also seen: `spool open` in a bare folder says "no spool project found from ., run `spool init`", and `spool init --local` refuses when `design/` already exists, so the copy has to be made after init.

Expected: a command run inside a registered root resolves that root by path.
