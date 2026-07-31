---
"spool.page": patch
---

Live frames now hold their animations while the camera moves, and get them back the moment it settles. A frame keeps showing the pixels it last painted, so nothing on screen changes — it simply stops spending the renderer on frames nobody is reading mid-pan. A pan across eight animated frames used to spend a sixth of its time inside their own animation loops; it now spends almost none.

The frame you went inside never holds, and neither does one being photographed for its still.
