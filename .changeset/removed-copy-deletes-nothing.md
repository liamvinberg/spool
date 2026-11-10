---
"spool.page": patch
---

Removing a folder that holds a team project's copy, such as a git worktree, no longer deletes the team's files for everyone. Spool waits until the folder stops changing, sends nothing if the folder is being removed, writes nothing into it, and stops syncing it. Deleting files in a copy that stays whole still reaches the team. If you delete design/ in a team project, Spool now stops syncing it instead of filling it again; open the project to get it back. `spool remove` now tells a running Spool to stop syncing the folder before it returns.
