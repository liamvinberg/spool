---
"spool.page": minor
---

The pages rail behaves like a real file explorer.

Going into a page now opens it: clicking a page's name, or arrowing onto its row, switches the canvas to that page and expands it. The chevron is the other direction and still only expands, without going anywhere. Dragging a frame across the tree opens each shut page it arrives at, with no wait, and closes it again behind you unless you dropped something inside, so passing over a folder no longer leaves it open.

Two new verbs on a frame's menu. "New page with selection" makes a page inside the one the frames are on and moves them into it, and one press of undo takes both halves back. "Move to page" opens a list of pages you can type at, which is how you move a frame or a page somewhere too far away to drag to. "Collapse all" is a button in the rail's header now, so you can reach it when the tree is too full to leave any empty space to right-click, and holding option while clicking a chevron folds just that page and what is inside it rather than the whole tree.

Three things that were wrong are right. Shift-clicking two rows selects the rows between them in the order the rail is drawing rather than in alphabetical order. Shift with an arrow key extends the selection instead of quietly nudging the frames on the canvas by ten pixels. And a name a frame or a page already answers to is refused the moment you commit it, without a trip to the daemon first.
