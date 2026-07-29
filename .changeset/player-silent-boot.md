---
"spool.page": patch
---

Playing a prototype in a normal browser window no longer hangs on a white screen. The shell hid the booting player with visibility, which stops Chromium from running animation frames inside the iframe, and the player waits on an animation frame before declaring itself ready, so the reveal deadlocked. The player now hides by opacity and stays inert, so it finishes booting while hidden. When a player genuinely cannot finish booting, the shell now says so after a few seconds and offers a link to the bare player instead of staying white. Errors thrown by browser extensions injected into the player are no longer mistaken for the prototype's own.
