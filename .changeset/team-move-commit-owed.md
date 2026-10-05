---
"spool.page": patch
---

Moving a project into a team no longer fails over files that never travel, like a symlink or a file over 25 MB, and those files and anything else in `design/` outside spool's layout stay in git, so teammates who pull keep them. A move is refused up front on a detached HEAD, and a move commit git couldn't take, because a crashed git left its lock or spool quit while waiting, is made the next time spool starts instead of being lost.
