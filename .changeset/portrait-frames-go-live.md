---
"spool.page": patch
---

A phone-shaped frame stayed a still picture at the zoom you actually read one at. The canvas decided a frame was drawn big enough to run only from its width, so a 390 by 844 frame needed 103% zoom before it booted, while a wide frame of the same area had been running for a while. It now goes by the frame's longer drawn edge, so portrait frames come alive at sensible zooms. Wide frames are unchanged.
