---
"spool.page": minor
---

Pages hold pages now, to any depth. A page is a folder under `design/frames/`, so a page inside a page is a folder inside a folder. `explorations/chat` is a page, `explorations` is the page holding it, and both are ordinary pages with their own canvas.

In the rail, drag a page onto another to nest it. Drag it back out to return it to the top level. Rows step in one level at a time, and each page opens and shuts on its own. Resting on a shut page opens it. Some gaps are ambiguous: the one under the last frame of a nested page could mean three different places. Move the pointer sideways to pick which. A page can never be dropped inside itself.

Every explorer verb works at any depth: rename, duplicate, move, new page, and delete to the Trash. Moving or renaming a page takes everything under it. The frames inside it, the pages inside those, their cameras and their arrangement all arrive with the folder.

A frame's name is still identity across the whole project. A page's name only has to be free among the pages beside it, so `explorations/chat` and `site/chat` are two pages rather than a collision.

Flat projects are untouched. Nothing migrates, `canvas.json` keeps the shape it had, and a project with no depth in it behaves exactly as it did.
