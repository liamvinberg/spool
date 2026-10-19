# #43 · Decide how a project becomes a team project and reaches each member's machine

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Created: 2026-10-18T17:43:55.701Z
- Updated: 2026-10-18T17:43:58.252Z
- Closed: 2026-10-18T17:43:58.252Z

## Question

How does a project become a team project, and how does a member get one onto their own machine? Graduated from the map's "Joining" fog by Decide teams, roles and invites (#19), which stops at "the invite is accepted, you're a member".

- Does `spool init` offer to link the project to Spool Cloud, or is it a separate step (`spool cloud`)? How does someone in several teams pick one?
- Making a team project from Home in the app or on the web. Should the repo-less projects Home makes today exist at all? Since `design/` leaves git on a team project, does a team project need a repo, or can a designer start one with none and link a repo later?
- Untracking `design/` when an existing project becomes a team project, without the pull that deletes it on teammates' machines ever syncing as a delete.
- How a fresh clone with no `design/` finds its team project. The same holds for a new git worktree: agents work in lanes, and today's skill opens a lane as its own project, which only works while `design/` is tracked.
- How a member whose agent runs in the cloud (Claude Code on the web, Codex cloud) fetches the folder.
- What a viewer turned editor goes through to get the folder.

Liam (2026-10-04) wants to rethink this UX rather than bolt the cloud onto today's flows. A rework of solo Home with no cloud in it is outside this map. May draw frames under `design/frames/explore/cloud/`.

*From Linear DEV-157.*

Related: #44, #54, #55, #65, #84, #20, #19, #18

Plane: SPOOL-43

## Comments

### agent, 2026-10-18T17:43:58.237Z

**Liam, 2026-10-04:** Context from Prototype signing in and running a team (#44), closed 2026-10-04: the invite walk ends, for an editor, at "spool on the Mac" without settling whether the page offers Open spool or Get spool for Mac (the page can't tell whether spool is installed). That's this ticket's to decide. Frame: `design/frames/explore/cloud/team/invite/invite-walk--joined`.

### agent, 2026-10-18T17:43:58.245Z

**Liam, 2026-10-04:** ## Resolution (grilling with Liam, 2026-10-04)

**A team project lives in Spool Cloud, known by its team and name, never by a path. A machine holds it as one or more local copies: real `design/` folders that Spool keeps out of git itself. The repo tracks only a small `spool.json` pointing at it. Projects are mostly born in a team at `spool init`, and every `spool` command fetches a missing folder.**

- **Model.** Spool Cloud holds the team project. Each **local copy** is a full, real `design/`: in a repo checkout, in a worktree, or on its own under `~/spool/<team>/<project>`. A machine may hold several local copies, all synced, and Home shows the team project as one cover. A repo is optional, so a designer can start with none, and linking a repo later just adds a local copy inside a checkout. Repo-less projects stay. Solo projects stay path-based and exactly as today. People never manage any of this.
- **The files stay in the repo.** Hiding them (`~/.spool` with a symlink) was rejected. Codex's sandbox can't write outside the workspace, Claude Code asks for every outside path, agents look for `design/`, and the mounting research found symlinks break Spool. Spool writes its own `design/.gitignore` of `*` at every local copy. It's never synced, and nobody edits the root `.gitignore`.
- **Git never writes to the team's copy.** Tested in a scratch repo: pulling the untracking commit deletes `design/` on teammates' machines, checking out an old branch that still tracks `design/` silently overwrites the live ignored folder with old files, and checking `main` out again deletes it. The daemon never syncs anything git writes into `design/`. The team's version comes back, and a vanished folder is refilled rather than synced as a delete.
- **The pointer.** A tracked `spool.json` beside `design/` (the project root, so per package in a monorepo) holds only the team project's link: `{ "project": "https://spool.page/tidemark/tidemark-app" }`. Renames redirect, so it never breaks. In a public repo it shows the team and project names, which grants nothing. Solo projects get no `spool.json`. Liam floated `spool.json` as a core file every `init` writes; that would be a core change, left for later.
- **Born in a team at `init`.** That's the usual path: an agent runs `spool init` for a new idea or an existing product.
- Not signed in, or in no team as an editor or admin: `init` is unchanged, asks nothing, and works offline.
- An editor or admin in a team: `init` writes nothing and errors, naming the choice: "You're in Tidemark and Devosurf. Run again with `--team <name>`, or `--local`." The agent relays that to the person. In a real terminal it's a picker.
- `--team <name>`, not `--cloud`, because people are in several teams. `--local` stays offline. `--team` needs the network.
- An optional machine setting, "New projects go to: ask / only this Mac / ", defaults to ask.
- Born in a team, `design/` never enters git, so there's no untracking commit.
- **The app.** "New project" follows the team picked in Home's switcher ("Your projects" means local). The web creates nothing.
- **Moving an existing project in (rare, still needed: Devosurf's first projects already exist).** An app action only, with no CLI verb. Spool uploads the whole folder first, then makes one commit on the current branch: `design/` out of the index (files stay), `spool.json` in, message `design: moved to Spool Cloud`. It uses History's machinery (temporary index, no hooks, waits out a merge or rebase) and never pushes. Shares carry over. The cloud's history starts at the move, git keeps everything before it, and the sheet says so in one line. Moving between teams is Idea: transfer a team project to another team (#55).
- **Fetching is implicit.** Any `spool` command that walks up to a `spool.json` with no `design/` beside it fetches first, then carries on. That covers fresh clones, new worktrees, and teammates whose pull removed the folder. The daemon refills a folder that vanished. Plain errors otherwise: not signed in → `spool login`; not a member → ask an admin to invite you; viewer → the browser link. The skill gains one sentence: `spool.json` with no `design/` means run `spool open`. Each worktree is its own local copy on the same live canvas, so lanes meet under the collision rule, and `spool remove <lane>` forgets a local copy without touching the team.
- **"Get it" on a machine with no checkout** (an invited editor, or a viewer made editor). The cloud records the repo from `origin` as information, not permission, and shows it on the team page; ssh and https forms count as the same repo. "Get it" offers:
- a known checkout on this Mac with that remote (the default)
- "In a checkout…", a folder picker
- "Just on this Mac", under `~/spool/<team>/<project>`

Spool never clones, but it may show the clone command to copy. Accepting an invite on the web leads to "Open in Spool" (or a download), which opens the app on that team with "Get it" on its covers.
\* **When a team project ends for this machine** (project removed, team deleted, member removed): Spool restores the solo `design/.gitignore` (`.spool/` only), leaves `spool.json` and git untouched, and shows one notice: "No longer synced with Tidemark. This is now a project on this Mac only." Committing `design/` back is the person's choice.
\* **Cloud agents are out of the first version.** When a cloud sandbox hits `spool.json` with no way in, the error says so. The token, `spool sync` and live-daemon sketch is in Idea: cloud agents drawing on a team canvas (#54). Tokens never go in a transcript.

Rejected: anchoring a team project to one repo, hiding the files outside the repo, a team flag-free `init` that silently stays local for team members, a bare `--cloud`, creating projects on the web, Spool cloning repos, replaying git history into the cloud, and a CLI verb for moving.

Evidence: `spool-cloud/research/157-cloud-agents-fetching-design.md` (`6cd145a`), a documentation read of Claude Code on the web, Codex cloud, Cursor and Copilot.

Vocabulary: **Local copy** is in `spool-cloud/GLOSSARY.md`, and the **Team project** entry now says "every editor" (`c152c8b`).

Required of core: ADR 0008's team-project exception now covers the moving commit; `spool.json` is a second walk-up marker; the daemon's git guard.
