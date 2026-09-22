---
"spool.page": minor
---

Breaking: a frame is now named by its path under `design/frames`, like `shop/checkout`, so two pages can each have a frame called `buttons`. Walks, links, the CLI and URLs all use the full path; a frame on the root page keeps its plain name. Renaming or moving a frame or page in Spool updates every `data-go`, `ui.go` and `links` literal that pointed at it. If you move folders outside Spool, `spool flows` lists the walks that need the new path. The first time this version opens a project it rewrites your existing walks to the new names once; check the result with `git diff`. A published site whose entry frame now has a longer name updates with `spool cloud publish <frame> --publication <id>`.
