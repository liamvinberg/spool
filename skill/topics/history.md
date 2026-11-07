---
summary: design/ committed for you, and its switches
---

Where a project's design/canvas.json says `"history": true`, the daemon commits design/ for you — everything that changed lands as one `design: <counts>` commit on the checked-out branch once the folder has been quiet for 45 seconds. So never commit design/ yourself and never stage it: the save is built from its own index, your staging area is left exactly as you found it, and spool never pushes. `spool init` leaves history off and says so (`spool init --history` starts a project with it on); a project with no key reads as off; `"history": false` in ~/.spool/config.json turns it off on that machine whatever a project asks for. A repository mid-merge, mid-rebase, on a detached HEAD, or with its index held waits for the next window.
