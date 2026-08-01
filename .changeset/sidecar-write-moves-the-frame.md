---
"spool.page": patch
---

An agent that places a frame by writing its `frame.json` now moves it on an open canvas. The daemon used to drop sidecar writes entirely, so the frame stayed where it was until you reloaded, and only a drag in the browser ever moved anything. The canvas still never reloads a frame's document for a sidecar write, and your own drag is not echoed back at you mid-gesture.
