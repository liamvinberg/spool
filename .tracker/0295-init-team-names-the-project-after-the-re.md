# #295 · init --team names the project after the repo and joins the repo's existing project

- State: closed (done)
- Labels: bug, ready-for-agent
- Created: 2026-11-11T10:49:04.984Z
- Updated: 2026-11-11T12:12:07.153Z
- Closed: 2026-11-11T12:12:07.153Z

## The bug

`spool init --team <team>` names the team project after the folder it runs in (`makeTeamProject` in `src/init.ts` passes `basename(root)` to `createProject`). Agents work in git worktrees whose folders are named after their task, so the first canvas of a repo lands on spool.page as `588-personal-learning-harness-spec` instead of `learn-harness`. The repo link on it is right, because that comes from git (`checkoutOf` in `src/git-remote.ts`).

Agents have been dodging this by running init in a temp folder with the right name (`/tmp/lh-588/learn-harness`, `/tmp/spool-244/arcade`, `/tmp/room-467/canvas`) and copying `spool.json` back. That leaves the misnamed project in the team, and the well-named one has no repo recorded, because a temp folder is not a checkout (`arcade`, `room`, `dayo`, `jemna` show "no repo linked" today).

Copying or committing `spool.json` is not the problem: a worktree that has the link joins the same project, as intended.

## What was decided (with Liam, task 599)

**1. The name comes from the repo, never from a worktree folder.** For `spool init --team` at the top of a git checkout, the project's name is, in this order:
- `--name <name>` when given (new flag on `init`; `move` already has one);
- the repo's name from `origin` (`github.com/liamvinberg/learn-harness` gives `learn-harness`);
- with no `origin`, the main checkout's folder name when this is a linked worktree (git's common dir), so a worktree's own folder name is never used;
- otherwise the folder's name, as today.

Outside git, or in a subfolder of a checkout (sandbox's `lab/`, room's `engine/`), it stays the folder's name unless `--name` says otherwise.

`spool move --team` takes the same default name through the same function (it names from `basename(root)` too, `src/team-moves.ts`). Only the default changes there; a clash still refuses as it does now.

**2. Init joins the repo's project when the team already has it**, instead of making a second one or refusing. Before creating, read the team's projects (`teams.projects`), then:
- a project whose `repo` equals this checkout's repo and whose name is the one init would use: join it;
- no such project, but exactly one project has this repo, and no `--name` was given: join that one;
- a project by the wanted name with **no** repo recorded, where the wanted name came from the repo: join it and record the repo on it (`setRepo`). This is what repairs the temp-folder projects above;
- a project by the wanted name with a different repo: refuse as today, the message now pointing at `--name` rather than "a folder with another name";
- several projects share the repo and none has the wanted name: create the new one (a repo may hold more than one canvas).
- `--name` given and free: create it, even when the repo already has a project. That is the way to a second project on purpose.

Joining means what `spool open` does for a folder with a link and no `design/`: write `spool.json`, fetch the team's `design/` (`fetchLocalCopy`, `src/open.ts`), register the root. It prints which project it joined and why, for example `joined https://spool.page/devosurf/learn-harness, this repo's project in Devosurf`, in place of the `initialized team project` line.

A `project_taken` from `createProject` (someone made it between the read and the create) goes through the same decision once more rather than failing.

## The risk, and the second review

The join path must never scaffold. Init's create path writes a blank `design/` and uploads it as the project's first saves (`makeTeamProject`, then `syncLocalCopy`). If a join took that path, a blank scaffold would be uploaded over a team's real canvas. Join must go straight to the fetch, and a failed fetch must leave neither `design/` nor `spool.json` behind. `refuseExisting` already guarantees there is no local `design/` when init runs, so nothing local can be lost; keep it first.

Because of that, this ticket gets a second review by an Opus reviewer (`model: anthropic/claude-opus-5-5:high`) beside the standard one, asked this one question: can any path through the new init upload local or scaffold content to a project that already existed?

## Turned down

- **Variants or a lane per worktree in the cloud.** A new feature for a question nobody asked, and the first init would still be misnamed. Worktrees stay copies of one project.
- **A server rule of one project per repo.** Repos legitimately hold more than one canvas (`lab` lives in `sandbox`). No change in spool-cloud at all: `createProject` keeps its name check.
- **Finding the main checkout's `spool.json` through git's common dir.** Once the link is committed, worktrees get it from git; before that, rule 2 covers it.

## Done looks like

- In a worktree folder `588-some-task` of a repo whose origin is `github.com/liamvinberg/learn-harness`, `spool init --team devosurf .` makes `devosurf/learn-harness` with the repo recorded.
- Run again in a second worktree of that repo that has no `spool.json`, it joins `devosurf/learn-harness`: same content fetched, no second project, nothing uploaded.
- A team project `learn-harness` with no repo is joined from that repo's checkout and gets the repo.
- A team project `learn-harness` with another repo refuses, naming `--name`.
- `--name other` makes `devosurf/other` beside it.
- Tests in `src/init.test.ts` against the fake spool.page it already uses (the `request` option), one case per rule above at the function level; the name rule is a pure function and is tested as one. No new browser or CLI test.
- The words follow: `spool init`'s help and output in `src/cli.ts`, `skill/overview.md`, `skill/topics/team.md` and `skill/topics/projects.md` wherever they say the project is named after its folder or tell an agent what to do in a folder with no `design/`.
- A changeset (published behaviour changes), per `docs/releases.md`.
- One line in loom, a separate repo at `~/personal/projects/loom` (on main, live through a symlink, so commit and push it there): `skills/loom/init.md` step 1 becomes "No `design/` folder: run `spool open .` when the repo root has a `spool.json`, else `spool init` (in a team it joins the repo's project when the team has one)."

## Where to start

- `src/init.ts`: `initTeamProject`, `makeTeamProject`, `teamProjectRefusal`, `refuseExisting`.
- `src/git-remote.ts`: `checkoutOf` gives `top` and `repo`; the name rule belongs beside it.
- `src/open.ts`: `fetchLocalCopy`, the join's second half.
- `src/cloud-teams.ts`: `projects`, `createProject`, `setRepo`.
- `src/team-moves.ts` around line 245 for move's default name.
- `src/cli.ts` lines 189 to 225 for the `init` verb.

## Leave alone

- spool-cloud (the server).
- The app's New project (`startTeamProject`, the `untitled` allocator) and solo `spool init --local`.
- Get it and rename.
- The team's existing projects: the stray `588-personal-learning-harness-spec` is already deleted and `learn-harness` has its repo set. Do not create, rename or delete anything in the real Devosurf team while testing; use the fake spool.page.

## Comments

### agent, 2026-11-11T12:12:07.153Z

Merged to main in 7d827761; loom line in a7eec62.
