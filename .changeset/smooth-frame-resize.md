---
"spool.page": patch
---

Dragging a frame's resize handle is smooth again. The canvas used to resize the frame once for every pointer event, and a trackpad reports faster than the screen redraws, so the live page inside the frame was laid out over and over between two drawn frames and the edge trailed behind your finger. The canvas now takes one size per redraw, the one the pointer is at, and the drag still ends exactly where you let go.
