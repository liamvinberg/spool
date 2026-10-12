---
"spool.page": minor
---

A local copy whose team project moved to another team follows it to its new address and keeps syncing, its `spool.json` left for the next pull; one whose project was moved out of its team ends, staying out of git until the pull brings `design/` back. Whenever spool puts `spool.json` in a repo (Move to team, `spool init` of a team project in a checkout, Get it into a checkout), it adds "design/ is a spool canvas: run `spool skill` before working there." to the checkout's AGENTS.md, else CLAUDE.md, else a new AGENTS.md, once.
