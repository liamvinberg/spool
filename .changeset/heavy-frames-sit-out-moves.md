---
"spool.page": patch
---

Panning and zooming stay smooth past heavy live frames. A frame that draws a big 3D scene could hold the whole canvas to a few frames a second while it played. Now, when a pan or zoom starts missing frames, the live frames you are not inside show their pictures until the camera stops, then carry on playing.
