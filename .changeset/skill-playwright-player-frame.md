---
"spool.page": patch
---

The `spool skill verbs` Playwright recipe now works on a player URL: it reaches frame content through the player's iframe instead of a top-level selector that could never match, and it says to open the browser at least as large as the frame so screenshots are not scaled down.
