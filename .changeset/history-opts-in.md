---
"spool.page": minor
---

Breaking: a new project starts with history off. `spool init` no longer commits your design/ for you unless you ask with `spool init --history`, and the old `--no-history` flag is gone. An existing project keeps whatever its canvas.json says.
