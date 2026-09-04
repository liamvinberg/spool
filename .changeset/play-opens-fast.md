---
"spool.page": patch
---

Play opens fast. The played tab shows its bar and the frame's name at once, with a loading readout until the frame is ready. The player no longer ships every frame in the project in one document: each frame is compiled to its own module and fetched when the session first walks to it, with the rest fetched in idle time so walks stay instant. A project that has been played is recomposed in the background after edits, so the next play finds it ready.
