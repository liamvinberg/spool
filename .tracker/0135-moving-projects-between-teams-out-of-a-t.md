# #135 · Moving projects between teams, out of a team and into a checkout

- State: closed
- Created: 2026-10-18T17:43:56.714Z
- Updated: 2026-10-18T17:44:01.411Z
- Closed: 2026-10-18T17:44:01.411Z

## What this settles

Task 136 grilled the UX of Spool Cloud projects next to local and git projects. Prototype: `design/frames/explore/cloud/moves` on [spool.page/devosurf/spool](http://spool.page/devosurf/spool) (code in `design/shared/ui/explore/cloud-moves/`). Not built yet.

## Decisions

1. **Team to team is the same project.** "Move to team…" also works on a team project. The project changes team (`team_projects.team_id`, and its name when needed) and keeps its id, sync history, shares and connected canvases.
2. **The old address forwards.** `spool.page/<old team>/<name>` keeps leading to the new address until the old team makes a project with that name. Daemons that follow a `spool.json` naming the old address keep syncing through it, and `spool open` says it moved and to pull.
3. **Who can move it:** an admin of the team it leaves and an editor or admin of the team it joins.
4. **Where:** the cover menu on Home (team projects too), and the dimmed covers on a team page for projects not on this Mac. And the CLI verb `spool move` (`--team <address> [--name]`, `--out`, `--into <checkout>`, or `<team>/<project> --team` for one not on this Mac), so an agent can do it when the person asks; it shows what will happen and asks first, `--yes` skips that.
5. **spool.json after a move:** the Mac that moves it rewrites `spool.json` in each of its copies, with one commit per checkout on the current branch, as the move in does. Other Macs follow the forward and get the file when they pull.
6. **People not in the new team:** their copies end, as when they are removed. The sheet names them before the move.
7. **Move out of … (admin):** the inverse of the move in. One commit puts `design/` back in git and takes `spool.json` out, then the project is deleted from the team; every other copy ends.
8. **Move into a checkout…** on a team project sitting in no repo (`~/spool/<team>/<name>`): pick a clone, `spool.json` goes at its root in one commit, `design/` moves in, the old folder goes to the Trash, and the repo is recorded. A checkout with its own `design/` is refused, as Get it refuses it.
9. **The AGENTS.md line:** whenever spool puts `spool.json` into a repo (move in, move into a checkout, init), the same commit adds "design/ is a spool canvas: run `spool skill` before working there" to AGENTS.md, else CLAUDE.md, else a new AGENTS.md. Never twice.
10. **Folders:** a copy at exactly `<projects location>/<old team>/<name>` moves to `<projects location>/<new team>/<new name>`. Copies anywhere else stay put.
11. **Name taken in the new team:** the sheet's Name field, prefilled, refuses in place.
12. **A team with no paid time left** takes no move, refused in the sheet, as creating a project there is.
13. **After a move out, a teammate's checkout:** their ended copy keeps its `*` `.gitignore` until git brings `design/` back, so the pull overwrites the ignored files instead of refusing. Their cover says "out of · pull its repo" meanwhile.
14. **Branch:** every commit lands on the current branch. Moving a copy from one repo to another is out of scope.

## First use

Move eidra-automations, eidra-kit, eidra-onboarding and eidra-usage from devosurf to eidra. The mover's account must be in both teams first.

*From Linear DEV-286.*

Related: #55

Plane: SPOOL-135
