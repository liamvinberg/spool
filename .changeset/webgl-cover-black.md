---
"spool.page": patch
---

Fixed frame covers for WebGL canvases. A cover is a self-taken screenshot, and browsers clear a WebGL canvas's drawing buffer once they are done compositing it, so the shot used to come back black. Frames now get a correct cover whatever they draw with.
