---
"spool.page": patch
---

Frames now compile with Spool's own TypeScript settings. A `tsconfig.json` in your repo, above `design/` or inside it, no longer changes what a frame compiles to, so a frame behaves the same on your canvas and anywhere else it is compiled. If a frame relied on one of those settings and stops compiling, the canvas shows its real error.
