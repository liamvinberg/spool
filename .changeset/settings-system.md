---
"spool.page": minor
---

spool has settings. Every setting is declared once, lives in one file, and is read and written through `GET /api/settings` and `PUT /api/settings`. `history` stays in design/canvas.json. `updateCheck` and the interface's colour tokens live in `~/.spool/config.json`, which spool now writes when you move a setting, changing only that key. A new `agent.permissions` setting (`ask`, `edits` or `bypass`) sets how the agent is fenced for a project on your machine; it is kept beside the project's registry entry and never in the repo. A themed colour lands on the canvas ahead of first paint and never reaches a frame. The sheet that shows all this is next.
