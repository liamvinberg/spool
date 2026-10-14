---
"spool.page": patch
---

The canvas answers faster right after a save to a shared component. Listing the canvas's frames no longer holds up the canvas's other requests while it reads every frame's folder, and recompiling the frames that use the component spends far less time checking their classes against the stylesheet.
