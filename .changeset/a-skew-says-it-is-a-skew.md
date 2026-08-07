---
"spool.page": patch
---

A cli and a daemon on different versions now say so, on whichever verb breaks. Running `spool shot` against a daemon built from another version failed with only `spool: unauthenticated`, which reads as a credentials problem and sends you looking at the wrong thing. `spool status` already knew the real story and said it, but the verb that actually broke did not. It now adds the same sentence: which version the cli is, and how to bring the two back in step. A genuine authentication failure against a matching daemon is unchanged.
