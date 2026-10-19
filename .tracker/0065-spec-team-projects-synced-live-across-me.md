# #65 · Spec: team projects synced live across members' machines

- State: closed
- Labels: ready-for-agent
- Parent: #3
- Blocked by: #57, #58, #61, #64, #105
- Created: 2026-10-18T17:43:55.913Z
- Updated: 2026-10-18T17:43:58.919Z
- Closed: 2026-10-18T17:43:58.919Z

## Problem Statement

A product team of two to eight people, each running Spool and their own agent on their own machine, can't work on one canvas. The only way one person's frames reach another's is through git: commit, push, pull, and the daemon's own history commits conflict on every pull. A teammate's agent writing a frame right now is invisible to everyone else until it's merged, and checking out an old branch rolls the canvas back. Two people's agents working on the same page find out about each other only at merge time.

## Solution

A project can be a **team project**: one live canvas held by Spool Cloud and mirrored as real files on every editor's machine.

- Every editor keeps a full, real `design/` on their own disk, as a **local copy**: in a repo checkout, in a worktree, or on its own under `~/spool/<team>/<project>`. Agents keep writing ordinary files.
- The daemon sends each saved file, whole, through Spool Cloud, which orders changes and keeps history, to every other editor's daemon, which writes the real file. A teammate's save reaches your canvas in about a second.
- On a team project `design/` leaves git. Spool writes its own `design/.gitignore`, the repo tracks a small `spool.json` pointing at the team project, and git never writes to the team's copy.
- There are no locks. When two saves collide, the first to reach Spool Cloud stands and the later one is **set aside**: kept in history, never applied, and its writer is told, with Compare, Put mine back and Hand to agent. An edit beats a delete. `canvas.json` merges key by key.
- Only Spool's own layout travels, and every receiving daemon checks it again.
- A project is born in a team at `spool init --team <name>`, or moved in from the app. Any `spool` command that finds `spool.json` with no `design/` fetches it. "Get it" on Home puts a team project on a machine that has none.
- When a team project ends for a machine (removed from the team, team deleted, project removed), the folder stays as an ordinary local project.

## User Stories

### Working live

1. As an editor, I want a frame my teammate's agent saves to appear on my canvas in about a second, so that we work on one canvas.
2. As an editor, I want the saved file to arrive as a real file in my `design/`, so that my own agent reads and edits it like any other.
3. As an editor, I want every save to reach the team right away, with no private mode, so that we never work blind on the same file.
4. As an editor, I want layout (`frame.json`, `canvas.json`), shared components, tokens and binary assets to travel, so that the whole canvas is the same everywhere.
5. As an editor, I want my camera, selection and compile cache to stay mine, so that a teammate doesn't move my view.
6. As an editor, I want the team project to be one canvas whatever git branch I'm on, so that switching branches never changes what the team sees.
7. As an editor on a train, I want to keep working offline and have my saves catch up when I reconnect, so that being offline isn't a blocker.
8. As an editor coming back online, I want my saves never to roll back changes teammates made while I was away, so that the team's canvas only moves forward.
9. As an editor, I want a teammate's save that changes a frame I'm looking at to update in place, so that I see the latest without reloading.
10. As an editor, I want my agent's own stale check (Claude Code's "modified since read", a Codex patch that no longer applies) to catch a teammate's change that landed while it worked, so that most overlaps never collide.
11. As an editor using the canvas hand edit, I want a teammate's change to refuse my edit with `stale-file` as today, so that the hand never overwrites what it didn't read.

### Collisions

12. As an editor whose save collided, I want the team to keep the version that reached Spool Cloud first, so that there's always one canvas.
13. As an editor whose save was set aside, I want my disk to take the team's version, so that my canvas matches everyone else's.
14. As that editor, I want a mark on each frame that renders the file ("your change was set aside, Ben's arrived first"), so that I know what happened and where.
15. As that editor, I want Compare to show my set-aside version beside the team's, so that I can decide.
16. As that editor, I want Put mine back to make my version an ordinary new save on top, so that I can choose mine deliberately.
17. As that editor, I want Hand to agent to redo my change on top of the winner in one press, so that my agent does the merging.
18. As that editor, I want nothing sent to an agent on its own, so that my agent never acts without me.
19. As an editor coming back from offline with many set-aside saves, I want one summary instead of a mark on every frame, so that I'm not flooded.
20. As the editor whose save won, I want not to be bothered, so that collisions cost only the person who can act.
21. As an editor who deleted a file a teammate was still editing, I want the file to come back for everyone and to be told, so that nobody's work disappears.
22. As an editor whose rename lost to a teammate's edit, I want the old path back next to the new one, so that both are visible.
23. As an editor moving pages around while a teammate reorders frames, I want `canvas.json` to merge key by key with the last write to each key winning, so that layout changes never collide.
24. As a team, I want nothing merged by character or by line, so that a merge can never silently produce wrong code.
25. As a team, I want no locks or claims, so that agents are never blocked by someone else.

### What may travel

26. As a member, I want a sync to write only `canvas.json`, `AGENTS.md`, `CLAUDE.md`, `frames/**` and `shared/**`, so that a teammate's files can't run commands outside the browser.
27. As a member, I want symlinks, file modes and foreign dot-folders never to travel, so that `.git/config`, `.claude/settings.json`, `.vscode/tasks.json`, `.envrc` or `.mcp.json` can't arrive on my disk.
28. As a member, I want my daemon to check every incoming file against the layout itself, so that a compromised cloud can't write outside it.
29. As an editor, I want a file outside the layout to stay local and Spool to show that it didn't travel, so that I'm not confused about why a teammate can't see it.
30. As a team, I want files over 25 MB refused with a clear reason, so that one huge asset can't break sync.

### Who can write

31. As a team, I want the cloud to refuse a viewer's saves, so that the role is enforced where it matters.
32. As a team, I want the cloud to refuse a removed member's and a revoked device's saves at once, so that removal is immediate.
33. As a removed member or a member made viewer, I want the daemon to stop syncing, say I'm no longer an editor of the team, and leave my folder as an ordinary local project, so that I never lose files.
34. As a team, I want what a removed member already wrote to stay as team content, so that removal doesn't break the canvas.
35. As a team, I want history to record who wrote each save and from which machine, so that we know where a change came from.

### Git

36. As an editor, I want `design/` out of git on a team project and the daemon to stop committing it, so that branches and pulls never fight the live canvas.
37. As an editor, I want Spool to write `design/.gitignore` of `*` in each local copy and never touch my root `.gitignore`, so that the repo stays mine.
38. As an editor, I want `design/.gitignore` itself never synced, so that it doesn't clash between copies.
39. As an editor checking out an old branch that still tracks `design/`, I want the daemon to put the team's version back instead of syncing the old files, so that git never rolls back the team.
40. As an editor pulling the commit that untracked `design/`, I want the vanished folder refilled rather than synced as a delete, so that the team's canvas isn't wiped.
41. As an editor, I want the daemon never to push, so that the repo's remote is only touched by me.

### `spool.json` and local copies

42. As a repo, I want a tracked `spool.json` beside `design/` holding only `{ "project": "https://spool.page/<team>/<project>" }`, so that any checkout knows where its design lives.
43. As a public repo, I want `spool.json` to grant nothing, so that showing team and project names is harmless.
44. As a monorepo, I want `spool.json` per package beside each `design/`, so that several projects coexist.
45. As an editor with a fresh clone, I want any `spool` command to fetch the missing `design/` and carry on, so that a clone just works.
46. As an agent in a new worktree, I want the same implicit fetch, so that each lane is a local copy on the same live canvas.
47. As an agent, I want `spool skill` to say that `spool.json` with no `design/` means run `spool open`, so that I know what to do.
48. As a person not signed in, I want the fetch to say "run `spool login`", so that I know the fix.
49. As a person not in the team, I want to be told to ask an admin to invite me, so that I know who to ask.
50. As a viewer, I want the fetch to give me the browser link, so that I can still look.
51. As a cloud-run agent (Claude Code on the web, Codex cloud), I want the error to say cloud agents can't fetch a team project yet, so that the agent doesn't keep trying.
52. As an editor with several local copies on one Mac, I want all of them synced and Home to show the team project as one cover, so that worktrees don't multiply projects.
53. As an agent finishing a lane, I want `spool remove <lane>` to forget that local copy without touching the team, so that cleaning up is safe.
54. As an editor, I want a team project renamed in the cloud to keep working through my `spool.json`, so that renames never break checkouts.

### Starting and moving in

55. As a person not signed in, or in no team as an editor or admin, I want `spool init` to work exactly as today, offline, asking nothing, so that solo use doesn't change.
56. As an editor or admin in teams, I want `spool init` with no flag to write nothing and error naming the choice ("You're in Tidemark and Devosurf. Run again with `--team <name>`, or `--local`."), so that my agent relays the choice to me.
57. As a person in a real terminal, I want that choice as a picker, so that I don't retype the command.
58. As an editor, I want `spool init --team <name>` to create the team project, write `spool.json` and the local copy, and never put `design/` in git, so that there's no untracking commit.
59. As an editor, I want `spool init --local` to stay offline and make an ordinary project, so that I can opt out.
60. As an editor, I want an optional machine setting "New projects go to: ask / only this Mac / ", defaulting to ask, so that I don't answer every time.
61. As a designer with no repo, I want to start a team project with none and link a repo later, so that a repo isn't required.
62. As a person in the app, I want "New project" to follow the team picked in Home's switcher, with "Your projects" meaning local, so that new work lands where I'm looking.
63. As an editor with an existing project, I want "Move to team…" in its cover menu and settings, so that Devosurf's existing projects can become team projects.
64. As that editor, I want Spool to upload the whole folder first and then make one commit on my current branch (`design: moved to Spool Cloud`, `design/` out of the index, files kept, `spool.json` in), so that the move is one clear step.
65. As that editor, I want the move commit made the way history commits are (temporary index, no hooks, waiting out a merge or rebase) and never pushed, so that my repo is safe.
66. As that editor, I want the sheet to say in one line that history before the move stays in git, so that I know where old history lives.
67. As that editor, I want my existing shares to carry over, so that links I sent keep working.
68. As the team, I want a moved project's teammates to pull the move commit without their `design/` being synced as deleted, so that the move never wipes the canvas.

### Getting it on a machine

69. As an invited editor, I want team projects not yet on this Mac dimmed on Home with "Get it", so that I see what I can bring down.
70. As that editor, I want "Get it" to offer a known checkout on this Mac with the project's repo first, so that the usual case is one click.
71. As that editor, I want "In a checkout…" with a folder picker, so that I can pick another clone.
72. As that editor, I want "Just on this Mac" under `~/spool/<team>/<project>`, so that I can work without the repo.
73. As that editor, I want to see the clone command for the project's repo, so that I can clone it myself; Spool never clones.
74. As a member, I want the team page to show which repo a project lives in, recorded from `origin` as information not permission, with ssh and https forms counting as the same repo, so that I know where the code is.
75. As a viewer made editor, I want the same "Get it", so that becoming an editor is one step.

### Ending

76. As an editor whose team project ends for this machine, I want Spool to restore the solo `design/.gitignore` (`.spool/` only), leave `spool.json` and git untouched, and show "No longer synced with . This is now a project on this Mac only.", so that I can commit it back if I want.
77. As an admin, I want removing a team project to stop sync for everyone and leave every local copy as an ordinary project, so that nothing is lost.

### Limits

78. As Spool, I want a team project's `design/` limited to 1 GB, so that one project can't fill the store.
79. As Spool, I want 30,000 saves per editor a month and 120 saves per project a minute, so that a runaway agent is stopped.
80. As an editor whose agent hits a limit, I want my daemon to say so and keep my files local until it lifts, so that I know why sync paused.
81. As Spool, I want the sync object to hibernate when nobody's connected and alert when one never idles, so that idle projects cost nothing.

## Implementation Decisions

- **Two halves:** a sync Durable Object per team project in spool-cloud, and a sync client in core's daemon. The protocol between them is the contract, versioned, and carries the team project's `FORMAT_VERSION`.
- **Sync object.** One per team project, holding the team's copy (current version of every path) and its history in the object's SQLite. Daemons connect over a WebSocket using the hibernation API. Each save is: path, the version hash it was built on (or "new"), whole content or delete, author account, device. The object assigns order, applies the collision rule, appends to history, and relays to every other connected daemon. Saves are authorised per device session and role on every message.
- **Collision rule**, as Decide what happens when two writers change the same file (#17) decided: a save built on a version the cloud has moved past is set aside (stored in history, not applied) unless it's an edit to a path whose current state is a delete, in which case the edit wins and the deleter is told. A rename travels as delete plus create, so a losing rename leaves the old path back. `canvas.json` is merged per key (each page's place, the canvas-wide order) with last write per key winning and no notice. Everything else travels whole.
- **Layout allowlist.** `canvas.json`, `AGENTS.md`, `CLAUDE.md`, `frames/**`, `shared/**`; regular files only; no symlinks, modes or dot-folders except Spool's own. Checked by the cloud on receipt and by every daemon before writing. `design/.gitignore` and `.spool/` never travel.
- **Daemon sync client.** Watches each local copy, sends saves, writes incoming files atomically, and tells its own incoming writes apart from local saves so they never echo. It queues saves while offline and sends them on reconnect, each carrying the version it was built on. Set-aside results update the local file to the team's version and record the set-aside save for the mark.
- **Git guard.** The daemon watches each local copy's repo HEAD and index. Changes to `design/` caused by a checkout, pull, reset or merge are never sent; the daemon restores the team's version over them, and refills a folder that vanished instead of syncing deletes.
- **History commits off.** ADR 0008's daemon commits are switched off for team projects; the team-project exception, including the one move commit, is recorded as an amendment to ADR 0008.
- `spool.json` is a second walk-up marker beside `design/`. Every CLI verb and the daemon resolve a project through it. A missing `design/` beside it triggers a fetch before the verb runs. Solo projects get no `spool.json`.
- **Local copies.** The daemon's registry gains team projects keyed by team and name, each with one or more local copy paths. Home shows one cover per team project. `spool remove` on a local copy forgets that path only.
- `spool init` follows Decide how a project becomes a team project (#43): unchanged when not signed in or in no team as editor or admin; otherwise errors with the named choice unless `--team <name>` or `--local` is given, or a picker in a TTY. `--team` needs the network. The machine setting is a per-user config key.
- **Moving in** is an app action only, no CLI verb: upload everything, wait for the cloud to confirm the full copy, then make the move commit with history's machinery. Teammates' daemons recognise the move commit's removal of `design/` as git's and refill.
- **Set-aside marks** live on the canvas on each frame whose closure includes the file, with Compare, Put mine back and Hand to agent. Hand to agent starts a turn on the daemon's agent with the set-aside content and the team's current file, only on press (ADR 0009). The offline summary replaces per-frame marks when more than a handful arrive at once.
- **Turn ends.** The daemon reports when its agent's turn ends, so the cloud can settle pages (used by the cloud compile and serving spec). For agents the daemon didn't spawn, the cloud's quiet spell does it.
- **Covers.** Home's covers for team projects come from the daemon's own photo booth, as today. Uploading covers is in the cloud compile and serving spec.
- **Limits** from Research: what a team costs to run (#42): 1 GB of `design/`, 25 MB per file, 120 saves per project a minute, 30,000 per editor a month. Enforced by the sync object; the daemon shows the reason.
- **Ending.** Membership changes reach connected daemons over the socket and are checked on reconnect. On end, the daemon stops syncing, restores the solo `design/.gitignore`, and shows the notice.
- `SECURITY.md` gains the team-project paragraph when this ships: "repository contents are trusted" extends to "your team's `design/`".
- **Blocked on** Decide history and restore for team projects (#57) for what restore does and how long set-aside saves are kept, and Decide how a broken sync is noticed and fixed (#58) for reconciliation on start and version skew. Those sections are filled in when they're decided.

## Testing Decisions

- Test what an editor or agent observes on disk and on the canvas, never the protocol's internals.
- **The main seam is the team harness**, grown from spool-cloud's publication e2e harness: two (or three) real daemons with separate state folders and repos, one Miniflare cloud with the sync Durable Object, Playwright for canvases. Tests read as behaviour:
- a save in Ana's local copy appears as the same bytes in Ben's `design/` and on his canvas
- offline saves catch up; a save built on an old version is set aside, Ben's disk takes the team's version, and the mark appears with its three actions
- an edit beats a delete; a losing rename leaves the old path
- two `canvas.json` changes to different keys both land
- a symlink, `.git/config`, `.claude/settings.json` or a file over 25 MB doesn't travel; a hostile cloud message writing outside the layout is refused by the daemon
- a viewer's and a removed member's saves are refused; removal turns the folder into an ordinary project with the notice
- `git checkout` of an old branch tracking `design/` restores the team's version on that machine and changes nothing for others
- a fresh clone with `spool.json` fetches on `spool open`; a new worktree is a second local copy on one cover
- `spool init` in each signed-in state; moving in makes exactly one commit and teammates pulling it keep their folders
- **Worker tests** for the sync object's rules alone: ordering, set-aside, edit-beats-delete, per-key merge, allowlist, limits, role and device checks, hibernation.
- **Core tests** for the daemon side that needs no cloud: `spool.json` walk-up, `init` flag handling and errors, `design/.gitignore` writing and restoring, the git guard against a scratch repo, history commits off. Prior art: CLI tests, `history.test.ts`, `watch-tree.test.ts`, project-transfer tests.

## Out of Scope

- Restore and retention: blocked on Decide history and restore (#57).
- Reconciliation of a broken sync and members on different versions: blocked on Decide how a broken sync is noticed and fixed (#58).
- Cloud agents fetching or saving (#54), agent presence (#38), signed saves (#40), transferring between teams (#55), a canvas of what's on `main` (#48).
- Mounting a cloud folder, git branches as transport, one-way mirrors (all rejected in #13).
- The browser canvas, compile and sharing, and presence: their own specs.
- Notifications beyond the set-aside mark and the ending notice: Decide what tells a member something changed (#60).

## Further Notes

- Sources: Decide where a team's design lives (#13), Decide what happens when two writers change the same file (#17), Decide what a teammate's files may do on your machine (#21), Decide how a project becomes a team project (#43), research #5, #7, #12, #42.
- Vocabulary: Team project, Local copy, Collision, Set aside are in spool-cloud's glossary; core's glossary gains them when this ships.
- Needs the accounts spec for device sessions and roles, and the core spec's frame CSP and font fetch before teams ship.
- Part of Wayfinder map: Spool Cloud for teams (#3).

*From Linear DEV-180.*

Related: #89, #114, #62, #60, #55, #54, #48, #43, #42, #40, #38, #21, #17, #13, #12, #7, #5

Plane: SPOOL-65

## Comments

### agent, 2026-10-18T17:43:58.892Z

**Liam, 2026-10-06:** Stays open. #71, #72, #74 and #75 are done, shipped across spool.page 0.28.0 to 0.31.0. #73 is done except one criterion, so it stays In Progress.

Waiting on #57 (Liam):
- How long set-aside saves are kept, and a purge for them (#73's last criterion).
- Restore, and Compare against older versions.
- What happens to a removed project's sync history. Today it is kept, but nothing can reach it.

Waiting on #58 (Liam):
- Checking a local copy against the team's copy on start and on reconnect.
- A "make this match the team" action.
- Members on different spool versions.
- Where the "never idles" alert goes. Today it is only a log line.

### agent, 2026-10-18T17:43:58.901Z

**Liam, 2026-10-10:** #58 is decided (see its resolution). To build here:
- The fingerprint check on every connect, the full path list when it differs, and the lost-record repair as set-aside marks.
- Ping with a 10 s pong timeout.
- The "Offline" line after 30 s.
- Match the team in the project menu.
- Pause on an old protocol or format, with an update prompt. The cloud accepts N and N-1, and is deployed first.
- The first updated member migrates the team's format.
- A `team_sync_drift` log line, and the never-idles alert, both to the Discord alerts webhook.
- An epoch in `welcome` for an admin restore from backup.

### agent, 2026-10-18T17:43:58.910Z

**Liam, 2026-10-11:** Closed on 2026-10-11 (agent-hub task 123): every ticket under it is built. Its last criterion, keeping set-aside saves as long as history, moves to Spec: team history, restore and backups (#114). What the launch adds to team projects is on Wayfinder map: Spool Cloud public launch (#89).
