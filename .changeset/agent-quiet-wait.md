---
"spool.page": patch
---

The wait before an agent answers no longer draws a line in the log, and neither does the model's own thinking.

Both had drawn a turning mark and a duration. The duration was the whole of what they said, because the wire sends no thinking text at all: every thinking field in every capture is empty, and only two of the thirty-six thinking blocks measured were long enough to count, so `thinking 0.0s` was the ordinary reading. The wait was also the one line the log ever removed, and removing it dragged everything above it down 38.3px at the moment an answer landed.

What is left is receipts. The log holds the words on both sides and one line per tool call, and nothing in it appears and then goes away. Two writes to one frame either side of a thought are now the one line they always were, since neither the wait nor the thought draws anything that could break the run between them.

A restored conversation written by an older version keeps its words and its rows. The two lines it stored for the wait and the thought are dropped as it is read.
