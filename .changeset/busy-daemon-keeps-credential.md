---
"spool.page": patch
---

A daemon too busy to answer in time no longer loses its saved credential. Before, a slow daemon looked dead to the CLI, which deleted its record and left every command refusing until the process was killed by hand.
