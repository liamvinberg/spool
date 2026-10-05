---
"spool.page": minor
---

Team projects sync only what belongs on the canvas. A symlink, a dot-folder such as `.git` or `.claude`, a file outside `frames/` and `shared/`, or a file over 25 MB stays on your Mac, and spool says it didn't travel; your daemon also refuses to write any of those when they arrive. When a team project's fair-use limit is reached (1 GB of `design/`, 120 saves a minute, 30,000 saves an editor a month), sync pauses with the reason and picks up by itself when it lifts. When you're removed from a team, made a viewer, or the team or project goes, spool stops syncing, gives `design/` back its ordinary `.gitignore`, and says "No longer synced with <team>. This is now a project on this Mac only." Your files and `spool.json` stay as they are.
