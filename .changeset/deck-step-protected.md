---
"spool.page": patch
---

Stepping through a talk with heavy slides no longer stutters while the step plays. Spool now waits until a step's fade and entrances have finished before it readies the slides around it or frees the ones left behind. A key pressed in the meantime is played first. A slide waiting out of sight no longer runs the animation frames its own code asks for, and its box carries `data-spool-resting`, so code that draws where Spool cannot see, such as a shared OffscreenCanvas, can stop too. The presenter view's next pane also waits until the step has played. When the next slide draws with WebGL, the pane shows a still of that beat, which the photo booth takes, so it no longer builds the slide's WebGL beside the one on show. `spool rehearse` now warns about WebGL at the number of contexts a talk really keeps: ten in full screen and on the presenter's slide. It also names a slide that keeps drawing every frame after its motion has ended.
