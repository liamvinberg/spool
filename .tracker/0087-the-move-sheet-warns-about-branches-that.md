# #87 · The move sheet warns about branches that still change design/

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Created: 2026-10-18T17:43:56.157Z
- Updated: 2026-10-18T17:43:59.727Z
- Closed: 2026-10-18T17:43:59.727Z

## What to build

After the move commit takes `design/` out of git, any branch that changed files in `design/` hits a modify/delete conflict when it merges. Found while moving chamfer (1,922 files, 21 MB) into Devosurf on devobee, in agent-hub task 51 (chamfer project, thread "so can you move chamfer to spool cloud"). The agent had to check each branch by hand.

Before moving, list local and remote-tracking branches whose diff against the merge base touches `design/`, and show them on the move sheet: their changes should be merged first or they'll conflict.

## Acceptance criteria

- [ ] The move sheet lists branches with unmerged `design/` changes, and nothing when there are none

*From Linear DEV-236.*

Plane: SPOOL-87
