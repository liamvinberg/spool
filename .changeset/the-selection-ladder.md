---
"spool.page": minor
---

Breaking: Play used to answer both P and Shift-Return. Shift-Return now steps back out of an element, so Play keeps P alone.

Selection is a ladder now. Double-click a frame's body to step into the element under the pointer, and again to go deeper. Hold the platform modifier and click to land on the innermost element in one go. Tab walks to the next element beside the one you have, Shift-Tab to the one before. The platform modifier with Return steps in without the pointer, Shift-Return steps back out, and Escape does what it always did: leave the frame you are inside, then climb.

Hover now draws two rings on the frame under the pointer: the element a click would take, and under it, dashed, the one a double-click would step into. So a step is something you see before you take it.

Going inside a frame moves to its label. Double-click the label, or press Return with the frame selected, and the frame runs as before. A click on the frame body still takes the frame, and dragging it still moves it.
