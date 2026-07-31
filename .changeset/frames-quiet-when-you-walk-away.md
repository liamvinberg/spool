---
"spool.page": patch
---

A canvas you walk away from now goes quiet. A live frame that has spent a minute with nothing on it stops running its animations: no pointer over it, not selected, not entered, and the camera at rest. It keeps showing the pixels it last painted, so nothing on screen changes. Point at it, select it, go inside it, or move the camera and it runs again at once.

The minute is long on purpose. Comparing two frames' motion side by side means touching neither of them, and that has to keep running for the whole of a look.

Animations also pick up where they stopped instead of jumping ahead to where they would have been, because a frame's animation clock now stops with it.
