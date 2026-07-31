---
"spool.page": patch
---

Stopping an agent now stops everything it started. The kill reaches the whole process tree rather than only the binary, so a dev server the agent left running goes with it, and a binary that ignores the first request is made to go a few seconds later.

A turn that finished no longer leaves its thread stuck. If the binary hangs around after the answer has landed, the daemon lets it go on its own for ten seconds and then ends it, so the next message in that thread sends instead of being refused until you restart the daemon.

Closing the model menu, or leaving the page while it is asking who you are signed in as, now ends the process that question started instead of leaving it running.
