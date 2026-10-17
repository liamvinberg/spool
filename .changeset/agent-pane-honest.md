---
"spool.page": patch
---

The agent pane no longer freezes in long chats: a save writes only what changed since the last one, not the whole conversation and every screenshot in it. A turn's line now says what is true. It reads Stopped when the turn was cut off, Waiting on you while a designer's question is open, and Stopping after Stop is pressed. A retry gets its own steps instead of sharing the failed turn's. A stop the agent never answers ends the turn after ten seconds. A turn that ends with the pane closed keeps its receipt and frames.
