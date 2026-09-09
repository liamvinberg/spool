---
"spool.page": minor
---

Replace a picture from the canvas and every frame that shares its source shows the new one. Pick a different import for an `img` and spool writes that import into the file the element came from, so the frames beside it are looking at the same change rather than a copy of it. Undo puts the old picture back the same way, and whatever the running frames had typed into them stays where it was.
