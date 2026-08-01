---
"spool.page": patch
---

A frame's cover no longer runs tens of seconds behind the file while an agent is streaming writes to it. Before, every write reloaded the frame and reset the wait the canvas gives a fresh boot to settle, so a steady stream of writes could starve the photograph until the stream paused. Now a picture that has been wrong for four seconds gets photographed mid-write instead of waiting any longer, and the next capture heals whatever that one got wrong.
