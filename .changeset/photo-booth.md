---
"spool.page": minor
---

Spool makes frame pictures in the background, in a browser of its own, up to four times faster than before, and the canvas no longer stops to take them. Pages you have not opened get pictures too, a frame an agent edits gets its new picture within about a second whether or not a canvas is open, and pictures follow the light or dark mode your frames are shown in. A frame that stops responding keeps its last picture and says why, instead of holding up the others. `spool shot` boots in the same browser: it now waits for the frame to settle the way its picture does instead of a fixed 300 ms, and renders in the light or dark mode you see.
