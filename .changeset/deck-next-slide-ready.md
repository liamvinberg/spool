---
"spool.page": patch
---

Stepping to the next slide of a talk no longer stalls while the slide starts up. Spool now readies the next slide out of sight before you press the key: its code runs, its WebGL scenes compile and it draws its first frame, then it waits, still, until it goes on. Its entrances and its videos start as it arrives, not before. In the presenter view, a slide that draws with too many WebGL scenes to ready beside the one before it is marked heavy, since it still starts up as it goes on.
