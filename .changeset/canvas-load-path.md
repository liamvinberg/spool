---
"spool.page": patch
---

The canvas loads faster.

The project list no longer blocks on disk walks. Every registered project's frames and covers used to be read one after another, in the middle of the one request the app waits on before it can show anything; now they are read together and out of the daemon's way.

A canvas no longer waits on the link graph to be resolved before it opens, which is a pass that can start a browser. And frames appear as soon as the canvas knows where the camera is, rather than at the next sweep after that.
