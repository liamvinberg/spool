# The daemon commits the canvas

> Amended for team projects. A team project's `design/` is out of git and its
> history is Spool Cloud's, so the daemon never commits it, whatever its
> `canvas.json` says. The one commit spool makes for one is moving an existing
> project in. See [Team projects](#team-projects) below.

Spool writes to your repository's history. The daemon watches `design/` in every registered project whose `canvas.json` says `"history": true`, and once the folder has been quiet for 45 seconds everything that changed lands as one commit scoped to `design/` on the checked-out branch (#78, #157). Canvas work has two authors and neither of them commits: an agent writes frame files and forgets, and the hands dragging frames write geometry sidecars no agent rule could have caught. Discipline had been the plan, and it left every session's checkout dirty and every arrangement an hour old unrecoverable.

**[ADR-0005](./0005-agents-author-files-verbs-stay-read-only.md) stands unchanged.** It is about the agent surface, and history is not on it. History is not a verb: there is no `spool commit` and no flag or route that reaches this, the verbs are still `selection`, `flows`, `shot`, `logs`, `url` and `skill`, and every one of them still only observes. An agent cannot invoke git through spool and gains no capability it lacked — its own shell had git all along. What changed is the daemon, which already owns the project's files, and the trigger is the folder going quiet rather than anybody asking for it.

**Said out loud, and refusable in one place.** `spool init` writes the flag on and prints one line saying so with the opt-out; `spool init --no-history` writes it off instead. No prompt either way, so init stays something a script can run. An absent key reads as off, so a project that predates history is unchanged by upgrading spool. `"history": false` in `~/.spool/config.json` turns history off for one person on one machine and beats every project flag, because a contributor to somebody else's project must never be committed on against their will (#158).

**What the writer will not do.** It never pushes, runs no hook, signs nothing, and does not touch your staging area — a save is built from a temporary index, so a half-staged unrelated change is neither swept in nor disturbed. It skips a repository that is mid-merge, mid-rebase, on a detached HEAD, or whose index is locked, and picks the batch up in the next window. A missing git binary or a `design/` outside a work tree disables the project after one logged notice. No failure reaches the daemon: a batch that cannot commit rides into the next window.

**Saves stay out of the product's history.** The message is one line — `design:` and a count of the batch, `design: 2 new, 3 frames, 1 moved, 2 files` (#159) — so product history is one pathspec away. Nothing in the release path reads a commit message, and nothing is pushed, so a save never bumps a version and never reaches a changelog.

## Team projects

A team project is one live canvas a team shares through Spool Cloud: every editor's machine holds a local copy, a real `design/`, and every save travels to the others as it happens. Git would fight that. Branches, pulls and checkouts would each roll the team's copy back or forward on one machine, and the daemon's saves would conflict on every pull. So on a team project `design/` leaves git and so does history.

**Never committed.** A project whose root holds `spool.json`, the tracked link to its team project, keeps no history: the daemon never commits its `design/`, whatever its `canvas.json` asks for, because that file arrives from teammates like any other and one machine's choice must not turn commits on for everyone. Who saved what, from which machine, is kept by the team project's sync object in Spool Cloud instead. `spool init --team` writes `"history": false` so the file says what happens.

**Out of git by its own hand.** Each local copy's `design/.gitignore` is `*`, itself included, so git never sees the team's copy, never writes to it, and no untracking commit is needed. The repo's root `.gitignore` is never touched. The repo tracks `spool.json` beside `design/`, which names the team project and grants nothing.

**The one commit.** Moving an existing project into a team, an action in the app with no verb, is the single commit spool makes for a team project: once Spool Cloud confirms it holds the whole folder, one commit on the current branch takes `design/` out of the index, keeps the files, and adds `spool.json`, with the message `design: moved to Spool Cloud`. It is made the way history's saves are made, from a temporary index, with no hooks, waiting out a merge or rebase, and never pushed. History before the move stays in git.

**Ending.** When a team project ends for a machine (its member removed or made a viewer, the team deleted, the project removed), the daemon stops syncing that local copy and puts the solo `design/.gitignore` of `.spool/` back, so `design/` shows in `git status` for its owner to commit if they want it. Spool commits nothing and leaves `spool.json` alone; while it is there, history stays off as above.
