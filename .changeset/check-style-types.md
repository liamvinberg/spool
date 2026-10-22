---
"spool.page": patch
---

`spool check` reads React's style types again when spool is installed with pnpm, so a frame that reads a style object's fields, like `style.transform`, no longer fails the check.
