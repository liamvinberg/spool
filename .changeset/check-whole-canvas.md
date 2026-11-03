---
"spool.page": minor
---

`spool check` with no arguments now checks the whole canvas, however large. A canvas whose frames import more than one check can hold is checked in batches, with one combined answer. Only a frame that imports too much on its own is left out, and it is named. The check also names every frame the canvas shows as broken, with the first line of why, including frames that throw as they start, which a typecheck can't see.
