---
"spool.page": patch
---

Exporting a frame the canvas has scrolled out of view now waits for what it draws on each animation frame, such as a WebGL shader, instead of exporting it undrawn.
