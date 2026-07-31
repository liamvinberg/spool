---
"spool.page": patch
---

The agent rail now rides out connection drops. A dropped socket no longer ends the turn: the rail goes back and reads the same turn from where it left off, so the work carries on and nothing is drawn twice. Queued messages survive a refresh and a daemon restart, are never sent twice, and come back to the composer when you close the thread they were waiting in. Stop works while the agent is asking, and a message typed before the rail has finished loading stays in the box instead of vanishing.
