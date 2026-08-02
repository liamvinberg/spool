---
"spool.page": minor
---

One undo stack for the canvas and the rail. `⌘Z` (`ctrl+Z` elsewhere) now walks back through everything you did, in the order you did it, and `⌘⇧Z` walks forward again.

It used to be geometry only. Renaming a frame or a page, dragging a row to a new place, dragging a frame onto another page, duplicating, pasting and making a page all take an undo slot now, mixed in with moving and resizing frames on the canvas. Undo a duplicate or a new page and the copy goes to the Trash with the usual toast, because there is nothing else to put it back to.

Deleting is unchanged. The toast still answers the first `⌘Z` after a delete, and once it drains the OS Trash owns what comes back.

If something changed on disk while you were away, the entry that talked about it is skipped and the press does the next real thing instead of nothing. The stack lives in the window and starts empty after a reload.
