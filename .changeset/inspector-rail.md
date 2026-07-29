---
"spool.page": minor
---

Breaking: the inspector rail is gone, and with it the elements and connections tabs. The connections list existed to be the one home for walks the canvas could not draw, and the canvas draws them now, on the frames that declare them. The right side of the canvas belongs to the agent panel that is being built there. Selecting elements on the canvas itself is unchanged: click a frame to go in, click again to pick what is inside it. The `stamp-labels` endpoint the rail used is removed too.
