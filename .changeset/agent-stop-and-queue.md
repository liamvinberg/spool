---
"spool.page": minor
---

You can stop a turn you no longer want, and you can say the next thing without stopping the one that is running.

The composer's footer holds a stop while a turn is in flight, and esc does the same thing from the field you just pressed Enter in. Click out to the canvas to watch a frame repaint and esc still stops the turn, once the canvas has nothing else to close. What it sends is a request rather than a kill: the agent survives it, finishes writing whatever it was in the middle of, and reports a clean ending, so nothing on disk is left half written. The log says `stopped` where it would otherwise say the turn was done. A tool call the stop caught is marked stopped rather than failed, because it never ran, and one caught before the agent had finished saying what it was reading keeps the half of the line it got to. The agent is told why its work ended, and you are not shown a note about your own press.

Enter during a turn no longer goes nowhere. The message is taken and held, and it stacks inside the composer above the chips, dimmed, with a take-back on each row. Nothing is written to the agent mid-turn: every held message goes out the moment the result arrives, in the order you said it, as one turn. Each one carries the chips that were up when you pressed Enter, so a message that waited nine minutes still means what you were pointing at when you wrote it.

Stopping cancels the queue and hands every word back into the composer, above whatever you were typing, one blank line between them, in the order they were going to be said. Taking one back by hand does the same thing, because there is one place for words that leave the queue unsent.
