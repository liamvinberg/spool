---
"spool.page": minor
---

Every `spool` command now fetches a team project's `design/` when it finds `spool.json` without one, so a fresh clone or a new git worktree just works. Each worktree is another local copy of the same live canvas, Home shows a team project as one cover on its team's page however many copies this Mac has, and `spool remove` forgets one copy without touching the team. When the fetch can't happen, spool says why: sign in, ask an admin to invite you, open it in a browser as a viewer, or work from a Mac because cloud agents can't fetch it yet.

Git no longer reaches the team's canvas. Checking out an old branch that still tracks `design/`, pulling the commit that took it out of git, or any reset or merge that writes there is never sent to your teammates. Spool puts the team's version back, and a `design/` that vanished is filled again instead of being deleted for everyone.

If you edit in a team, `spool init` asks where the project goes: a picker in a terminal, or for an agent a message naming the choice, with nothing written. `--local` keeps the project on this Mac, offline, and the new "New projects go to" setting answers once for every init. Signed out, or editing in no team, `spool init` works exactly as before. In the app, New project starts the project in the team Home's switcher shows.
