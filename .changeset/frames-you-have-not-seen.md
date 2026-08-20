---
"spool.page": minor
---

The canvas now marks the frames you have not looked at. A frame spool has no record for wears a small white disc beside its name; one whose own folder has moved since you last looked wears a ring. The same marks appear in the pages rail, where a shut page says only that something inside it is unseen, and in the finder, which counts them and never clears them — a name in a list is not a frame.

A mark clears by being read rather than by being clicked: the frame has to hold at least half the viewport in one direction, wholly enough to see, for the best part of a second, and the canvas has to have somebody at it. Pressing a frame clears it too. The record lives in `design/.spool/seen.json`, which is app-owned and gitignored, so it is yours and never travels with the project — and the first read of a project seeds it whole, because you cannot be behind on frames that existed before spool started counting.
