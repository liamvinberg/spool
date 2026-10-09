---
"spool.page": patch
---

The agent in the rail always finds a `spool` command now, and it is the spool that started it. Before, a daemon run from a checkout gave the agent no `spool` at all, and it could spend minutes searching the disk for one.
