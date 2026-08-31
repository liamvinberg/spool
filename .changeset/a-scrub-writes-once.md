---
"spool.page": patch
---

Scrubbing a frame's x, y, w or h in the properties rail no longer jitters. A scrub used to write the sidecar on every 4px tick, and every write came back around: the daemon's change stream echoed it, the canvas refetched the projection under the drag, and stale geometry stomped the newer state on screen. A scrub now moves the screen alone while the pointer is down and writes once when it lifts — the same shape a corner drag has always had — so the whole gesture is one write, one echo after release, and one press of undo.
