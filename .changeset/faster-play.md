---
"spool.page": patch
---

Play opens much sooner. While a project's canvas is open, Spool prepares play in the background, so pressing play a moment after opening a project no longer waits for every frame to build. After an edit, only the frames that changed are built again. On a project of 859 frames, the first play takes about half a second instead of 12, and playing right after an edit takes under a second instead of about nine.
