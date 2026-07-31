---
"spool.page": minor
---

You can see what the agent is doing to a frame. Before, the canvas said nothing: a frame's picture swapped for a new one some seconds after a write landed, and that was all.

Now the frame the agent is working has a small square at its left edge and a line running from it. The line is as tall as the frame while the agent is reading the frame, and short while it is writing to it. It goes taut while a call is running and slack between calls, and every write that lands plucks it. While the agent takes a screenshot the line goes and four corner marks are drawn around the frame instead.

A write also marks what it changed. The block that changed is tinted for under a second, and a short mark stands outside the frame at that height for six seconds, so you can still read the shape of a run of edits after the last one. If the agent edits a component two frames use, both frames get marked.

None of it uses words. The rail is right there and already says which call is running and which frame it names.

Two things it does not do. The camera stays where you put it: pressing the frame name in the rail is still how you go to a frame. And a frame drawn too small to run keeps the line and the corners but gets no mark on any block, because there is nothing on screen to measure.
