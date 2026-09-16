---
"spool.page": patch
---

Fixed blank or incorrect image and PDF exports of animated frames. Long frames that fit at native resolution now reduce pixel density when 2× capture would exceed the image limit. PDF creation runs off the canvas thread, and PNGs download as each frame finishes capturing.
