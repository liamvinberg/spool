---
"spool.page": patch
---

The canvas no longer redraws everything while an agent is streaming. A turn used to render the whole canvas ten times a second whether or not anything in it had moved, and every render refolded the log of every conversation the project had. Now a tick that changed nothing draws nothing, a transcript is folded once per change rather than once per render, and panning the camera costs the same whether a turn is running or not. Long conversations stay smooth.
