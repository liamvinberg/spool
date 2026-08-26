---
"spool.page": minor
---

The properties rail now edits an element's string attributes. Pick something and the rail lists what HTML gives it: `alt` on an image, `href` on a link, `placeholder` on an input, `title` on anything, with the value the file holds. Type a new one and it is spliced into the file. A value written as an expression greys with the expression shown, and a `data-go` shows its walk target read-only, because that arrow is edited in flows.

Images can be swapped by hand. Drop a picture onto a selected image, or pick one from the rail, and spool writes the file beside the frame, writes the import, and points `src` at it. There is no URL to type, because an image in a frame is an import. A picture too big for the document's 512 KB image budget is refused with its size, and a `src` the file computes is refused with the expression named.
