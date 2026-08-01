---
"spool.page": patch
---

A frame that writes the clipboard with `navigator.clipboard.writeText` — most shared copy buttons do — was blocked on the canvas and in the player, with "the Clipboard API has been blocked because of a permissions policy" in the frame's console, while the same frame opened on its own could write. Both surfaces now delegate clipboard writes to the frame they embed, so a frame keeps the clipboard it would have had. `ui.copy` is unchanged and still the way to copy through the canvas or player; clipboard reads remain unavailable.
