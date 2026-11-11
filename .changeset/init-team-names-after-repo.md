---
"spool.page": patch
---

`spool init --team` in a git worktree no longer names the team project after the worktree's folder: at the top of a checkout it takes the repo's name, and where the team already has the repo's project it joins it, fetching its canvas and uploading nothing. `--name` names a project otherwise, and `spool move --team` names a project moved in the same way.
