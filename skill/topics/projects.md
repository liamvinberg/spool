---
summary: setting up: init, open, remove, worktree lanes, the daemon, moving a project
---

Lifecycle commands take a path and work offline, except that a team project needs spool.page:
  spool init [path]     scaffold design/, register the project, and open its tab
  spool init [path] --team <team>    start it as a team project instead (needs `spool login` and the network). At a checkout's top it is named after the repo, never a worktree's folder, and where the team already has the repo's project init joins it: it fetches that design/ and uploads nothing. Elsewhere it takes the folder's name. `--name <name>` names it otherwise, and is how a repo gets a second project
  spool init [path] --local          keep it on this machine only; an editor in a team must say which, and plain init then writes nothing and names the choice: relay it to the human
  spool open [path]     register an existing project by walk-up and open its tab
  spool remove [path]   forget one exact registered root without deleting its files

The project verbs (selection, flows, shot, logs, url) resolve the project by walking up from cwd to design/canvas.json or a team project's spool.json, refuse roots they don't know (`spool open` once per machine registers), and auto-start the daemon.

For a disposable implementation lane, run `spool open <lane>` before verification and `spool remove <lane>` before erasing the worktree. Never alias a lane to the registered main checkout: verification must read the lane's source. In a team project a lane is one more local copy of the same live canvas: open, check and the read verbs there fetch its design/ (skill never does), its saves reach the team like any other, and `spool remove <lane>` forgets that copy without touching the team.

The daemon: `spool serve` / `spool status` / `spool stop` are the handles; `spool autostart` makes it start at login (macOS); `spool upgrade` installs the latest release and restarts it. `spool status` prints where it listens and warns when a running daemon predates the CLI (`spool stop`, then any verb, updates it) or runs from a checkout since deleted, which every verb warns of too. The CLI boots frames in spool's own headless Chrome; it never reads the human's canvas.

Moving a project is the person's call, never yours: ask them first, and only once they said yes run
  spool move --team <address>                           this project, on this Mac only, into a team, named as init names one: design/ goes up and out of git
  spool move --team <address> [--name <name>]           this team project to another team (the same project; its old address leads on)
  spool move <team>/<project> --team <address>          one that isn't on this Mac
  spool move --out                                      this project out of its team: design/ goes back into git; the team keeps it 30 days in its trash
  spool move --into <checkout>                          this project, kept in no repo, into a clone of its repo
with --yes. Without --yes it says what the move does (who loses the project, the commits it makes, the folder it moves) and asks; relay that to the person when you have no terminal to ask at. Without --team, or with a team the account isn't in, it lists the account's teams.
