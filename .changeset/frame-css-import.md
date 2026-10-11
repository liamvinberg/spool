---
"spool.page": patch
---

A frame's stylesheet that starts with `@import`, such as a Google Fonts link, now loads in the player and in published websites. Before, the import landed after other rules, so the browser ignored it and the font never loaded.
