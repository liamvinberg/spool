---
"spool.page": minor
---

`spool check` now names frames that draw too slowly to play smoothly. Spool times a frame each time it is edited, at Retina sharpness, and the check lists any that manage fewer than 45 frames a second, so an agent sees a heavy frame before it slows your canvas down. It is a note, never a failure.
