---
"spool.page": minor
---

Start a team project with `spool init --team <team>`. Its `design/` lives with your team on spool.page instead of in git: every file you or your agent save reaches your teammates' `design/` and canvas in about a second, and theirs arrive in yours as real files. Frames, `frame.json`, `canvas.json`, shared files and images travel; your camera, selection and caches stay on your Mac. The repo tracks only a small `spool.json` that names the team project, `design/` keeps itself out of git, and spool never commits it. In a clone that has `spool.json` but no `design/`, `spool open` fetches it.
