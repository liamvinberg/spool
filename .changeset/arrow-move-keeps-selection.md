---
"spool.page": patch
---

Moving an element with the arrow keys keeps it selected when the frame is slow to reload. Before, a reload that took more than a few seconds dropped the selection to the frame, so the next arrow press nudged the whole frame.
