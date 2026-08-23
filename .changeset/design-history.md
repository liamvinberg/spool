---
"spool.page": minor
---

The daemon now keeps history for your canvas. When `design/` has been quiet for 45 seconds, everything that changed since the last save lands as one commit on the branch you are on, so a layout you liked an hour ago is always recoverable and the checkout is never dirty from canvas work. Frame arrangements count, so a frame you dragged is saved too.

Saves only ever touch `design/`. Anything you had staged elsewhere is left exactly as you staged it, and spool never pushes. It waits instead of committing while a merge or rebase is in flight, while HEAD is detached, or while another git command holds the index, and it picks the batch up in the next window. A project that is not in a git repository says so once and stays silent after that.
