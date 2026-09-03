---
"spool.page": patch
---

`spool upgrade` now restarts a daemon that is behind the cli when there is nothing newer to install. Before, a daemon the Mac app had started from an older bundle stayed on that version after the cli was updated: `spool status` pointed at `spool upgrade`, and `spool upgrade` said it was already the latest and left the daemon alone.
