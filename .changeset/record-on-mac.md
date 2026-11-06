---
"spool.page": patch
---

Record works on a Mac. Every recording there failed, and took spool down with it, because the browser that renders the clip can't be told when to draw on macOS. On a Mac it now takes a picture of each frame instead, so clips come out just as smooth. A second recording in a row no longer fails to read the frame's clock, and a failed recording no longer stops spool.
