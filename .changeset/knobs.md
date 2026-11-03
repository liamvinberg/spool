---
"spool.page": minor
---

Added knobs. A frame can declare values with `ui.knobs({...})`, such as a radius, an easing, a colour or a spring, and they show in the properties rail under the frame's size. Drag one and the frame moves live; let go and the new value is written into the frame's file, one undo step. A knob in a shared file is one value for every frame that reads it, and Save as variant copies the frame beside itself as `name--b`. Agents learn it from `spool skill knobs`.
