---
"spool.page": minor
---

**Slow slides, explained.** `spool check` says why a frame timed slow, and which slides of a talk will lag. The photo booth now counts what a frame does while it times it: animations of properties that re-lay the page out or repaint it, animations that never end, a requestAnimationFrame loop, canvases, WebGL scenes, videos, and pictures far larger than they are drawn. A slow frame's note names the likely causes and what to change, one line each. Slides of a deck are also timed as each beat enters, and checking a talk lists its slow slides by number with the worst beat, and sums up how many of its slides timed slow. A timing now counts as stale when a shared file the frame imports changed since, too.
