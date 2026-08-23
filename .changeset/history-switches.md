---
"spool.page": minor
---

History is now switchable, and on for new projects. `spool init` writes `"history": true` into `design/canvas.json` and prints one line saying so; `spool init --no-history` starts a project without it. A project that predates this keeps history off until the key is added, so upgrading spool never changes what your repo does. Set `"history": false` in `~/.spool/config.json` to turn history off on your machine whatever a project asks for. With history off, the daemon never watches or commits `design/` for that project.
