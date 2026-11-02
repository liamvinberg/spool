---
"spool.page": minor
---

Imported images now load by URL instead of riding inside the frame's document, so the 512 KB image budget is gone. A frame can import photos up to 25 MB, and `spool shot` warns when one is bigger than a frame should load. Imported images still draw into a canvas or WebGL, and still show up in exports and covers.
