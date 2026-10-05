---
"spool.page": patch
---

Spool no longer deletes a file from a team project's `design/` because git seemed to have put it there. Frames a teammate made on their own branch before pulling the move commit now go up to the team, and a file an old branch brings that the team never had stays on disk, unsent, with a note saying so.
