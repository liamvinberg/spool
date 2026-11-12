---
"spool.page": patch
---

The room's screen now plays a presented talk in a browser process of its own, apart from the presenter view. Its slides no longer compete with the presenter view for WebGL, so a slide drawing several WebGL scenes is ready before its key far more often, and the presenter view marks fewer slides heavy. Where the browser cannot reach that process, the room plays as it did before.
