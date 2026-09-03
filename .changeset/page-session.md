---
"spool.page": minor
---

Frames on one canvas page now share one session. A write to `ui.state` in one frame re-renders every frame beside it, and a frame booting onto a page where something was already written joins that state, so two frames side by side prototype two clients of one app: click in one, watch the other. The canvas is the bus and its memory; the page's session lives as long as the tab. The player is unchanged, and a frame's scenario seed is never shared, only what the app wrote after it.
