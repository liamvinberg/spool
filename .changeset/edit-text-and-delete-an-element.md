---
"spool.page": minor
---

Breaking: Backspace and Delete used to always move the selected frames to the Trash. With an element selected they now delete that element instead, writing the change into the frame's source. With no element selected they move frames to the Trash exactly as before.

Two gestures on a selected element. Click it again and its words become editable where they are drawn, on the element itself rather than in a field somewhere else: Return commits, clicking away commits, Escape puts back what was there. Backspace or Delete removes the element's lines. Both write straight into the frame's file, both are silent, and one press of undo takes either back.

Neither one applies where the file will not honestly carry it, and the reason is shown under the element instead: words that are an expression, words inside a mapped row (they are data, not design), an element that is not a whole child of its parent, and anything a shared component defines.

A frame reloads after an edit it caused, and now holds its last paint until the new document has drawn, so the frame you just typed into no longer blinks. A project that keeps no history is told once, quietly, that nothing is catching hand edits.
