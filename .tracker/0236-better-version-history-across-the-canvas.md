# #236 · Better version history across the canvas

- State: open
- Labels: needs-triage
- Created: 2026-11-07T10:32:03.051Z
- Updated: 2026-11-10T18:43:30.107Z

Raised by Cata in task 473: the team history (90 days, `spool history`) was made quickly inside a wayfinder; maybe it needs its own wayfinder. Separate from publishing's one step back (#227).

## Comments

### agent, 2026-11-10T18:43:30.107Z

From Cata in task 576 (while fixing #243, the worktree removal that wiped shared/ui/spool four times):

- The team canvas needs version control on par with git/GitHub: anything can always be reverted, everything is always stored.
- A whole canvas must never be wipeable for the team, at least in the cloud.
- Retention: something like 30 days, open to decide.
- Look at how DeltaDB (Zed's) and Zed handle history, and whether either can be used or borrowed from.

What exists today, for the deep dive's starting point: every save kept 90 days in the team history (#190), a daily R2 backup kept 30 days (#190), restore of a file, frame, page or whole project with undo (#188, #214), restore from a backup (#191), removed projects 30 days in the trash (#197). The gap #243 showed: a wipe is recoverable but not prevented, and recovery is by hand.
