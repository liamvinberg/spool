# #100 · Decide how a project leaves a team

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Blocked by: #57
- Created: 2026-10-18T17:43:56.318Z
- Updated: 2026-10-18T17:44:00.233Z
- Closed: 2026-10-18T17:44:00.233Z

## Question

There is no way back from a team today. Make it local only (its `design/` back into git, `spool.json` gone), delete it with a trash and a real purge, move it to another team (Idea: transfer a team project to another team (#55)): which exist at launch, who may do each, and what teammates' local copies become.

*From Linear DEV-251.*

Related: #101, #116, #122, #96, #90, #55

Plane: SPOOL-100

## Comments

### agent, 2026-10-18T17:44:00.225Z

**Liam, 2026-10-11:** ## Resolution (grilling with Cata, 2026-10-10, agent-hub task 118)

Cata took every recommendation.

- **One way out: Remove from team.** Every local copy is kept, so "local only" and "delete" differ only in the cloud copy. One action ends syncing everywhere and puts the cloud copy in a trash. Going local is Remove plus Put design/ back in git.
- **Who:** admins only, as in the code today. The confirm sheet says what ends ("4 people stop syncing, 2 shares stop"). No typing the name, because the trash is the safety net.
- **Trash:** 30 days, the same as a deleted team. Any admin restores it from the team's Projects page. **Delete now** purges at once: files, team history, set-aside saves, compiled frames, covers. Daily R2 backups age out within 30 days after that. Shares pause and come back on restore. Nobody can take the name while it's in the trash. On restore, members get it back with Get it (#96).
- **Put design/ back in git:** in the app only, no CLI verb. It makes one commit on the current branch: `design/` added, `spool.json` removed, message `design: moved out of Spool Cloud`. It uses the move-in machinery (temporary index, no hooks, waits out a merge or rebase) and never pushes. The remove sheet offers it for the admin's checkout, and so does each teammate's "No longer synced" notice. It is the same action a lapsed team uses (#90).
- Why on every machine: tested in a scratch repo, `git pull` of a commit that adds `design/` **refuses** when the same files sit untracked on the teammate's disk, even identical ones. When each machine makes the same commit, identical files merge cleanly and only files that really differ conflict.
- **Teammates' copies** are never deleted, Delete now included. The notice names who removed it: "Ana removed tidemark-app from Tidemark. It's now a project on this Mac only."
- **Moving to another team** is not at launch. Idea: transfer a team project to another team (#55) stays an idea. By hand: remove it, then move the local copy into the other team. History starts fresh and shares don't carry over.

For the build:
\* `removeProject` deletes the D1 row outright and leaves the sync object forever. It becomes a soft delete with a purge after 30 days, like `deleteTeam`/`purgeTeams`. There is no remove button in the app or on spool.page yet.
\* An ended copy (`ended: true`) can be moved into another team.
\* Get it after a restore, on a checkout where someone already put `design/` back in git, needs the moving commit again rather than waiting for one.
\* A `spool.json` naming a removed project answers "removed from ", not "not a member".

Glossary: **Removed project** in `spool-cloud/GLOSSARY.md`, branch `118-wayfinder-dev-251` (af3f972).
