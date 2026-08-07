---
"spool.page": patch
---

Zooming into a frame no longer replays its arrival. When a frame gets big enough to read, spool now holds its picture until the real document has finished arriving: fonts loaded, entry animations played out, nothing still moving. What you see is the picture, then the frame it is a picture of.

Before this, the picture came away the instant the document reported loaded, which is halfway through its arrival. A frame that fades its content in was caught at the start of that fade, and a frame that draws to a canvas had not drawn anything yet, so a settled picture was replaced by black or by a replayed entrance and then settled a second time.

The wait is bounded, so a frame that animates forever or never stops changing still appears after about a second. Going into a frame is unchanged: you asked to be inside it, and watching the entrance play is part of that.
