---
"spool.page": patch
---

While an agent worked, the mark the canvas drew for a write could run far past the frame it belonged to: rewriting a whole file drew a lane the height of the whole document, and an edit below the fold drew one that started off the bottom edge. A mark is now clipped to the frame it is about, so it never claims more than the frame shows, and a write that landed entirely out of view draws nothing.
