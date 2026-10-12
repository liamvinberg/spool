---
"spool.page": minor
---

Move a team project to another team (the same project, its old address leading on), out of its team (design/ committed back into git), or from no repo into a checkout, in the app or with `spool move`, which says what the move does and asks first; teammates' copies follow the move and keep syncing until they pull. Whenever spool puts `spool.json` in a repo it also adds "design/ is a spool canvas: run `spool skill` before working there." to the checkout's AGENTS.md, else CLAUDE.md, else a new AGENTS.md, once.
