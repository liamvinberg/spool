---
"spool.page": minor
---

Breaking: double-clicking a frame goes inside it again. Since the direct-manipulation release a double-click on a frame's body stepped one rung down into the element under the pointer, and going inside was the label's double-click or Return. Running a frame is the thing you do all day on this canvas, so it takes the gesture back.

Reaching an element is unchanged everywhere else: the platform modifier and a click still land on the deepest element in one go, ⌘Return steps down a rung at a time, Tab and Shift-Tab walk the row, and Shift-Return and Escape climb. What is gone is the rung-at-a-time descent by pointer — the ladder is the keyboard's now.

Hovering a frame draws one ring, the rung a click would take. The dashed ring beneath it went with the gesture it was drawn for: a second ring that promises a step nothing takes is noise.
