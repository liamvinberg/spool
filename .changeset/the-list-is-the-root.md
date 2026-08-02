---
"spool.page": minor
---

The rail's `root` row is gone. The root page is the `frames/` folder itself rather than a folder inside it, so the list is the root: frames at the top level draw as loose rows beside the page rows, and a flat project's rail is just its frames with no folder wrapped around them.

Those loose rows are ordinary rows. Reorder them, drag one into a page, and drag a frame out of a page onto the top level to put it back on the root page. Every page draws its frames first and then its pages, so the root page's frames sit above the top-level page rows. Clicking a root frame takes the canvas to the root page, exactly as clicking any frame row takes it to that frame's page.

Root frames answer every verb the rows beside them answer: rename, duplicate, copy, and Move to Trash. The collapsed strip lists the pages, and no page row lights while the root page is the one on the canvas.
