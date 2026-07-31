---
"spool.page": patch
---

The rail never scrolls sideways, and a thread with nothing running stays quiet.

A daemon restart could leave the rail asking after a turn that no longer exists; the daemon's ordinary "no turn to read" answer was drawn into the log verbatim, and its unbroken width dragged a horizontal scrollbar across the transcript. That answer now ends the read silently — the stored picture was already the whole thing to draw — and the log's columns clip sideways overflow so no row can ever widen the rail.
