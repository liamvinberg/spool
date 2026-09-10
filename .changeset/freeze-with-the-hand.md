---
"spool.page": minor
---

Frames now hold still while you have an element selected. Picking anything on the canvas stops every live frame's animation, including the frame you picked in, so shaders and motion are not moving under your hands while you work. Layout still runs, so a frame that changes size still lays itself out. Deselecting starts them all again from where they held.
