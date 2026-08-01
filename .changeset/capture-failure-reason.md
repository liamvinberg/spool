---
"spool.page": minor
---

`spool logs <frame>` now tells you why a frame's cover never landed. Before, a frame whose self-capture kept failing just sat as a dark placeholder with no way to find out why. Now the last failure reason (the document was too large, the reply never came, and so on) is printed after the frame's boot logs, and it clears itself the next time a capture succeeds.
