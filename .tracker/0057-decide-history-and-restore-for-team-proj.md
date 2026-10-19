# #57 · Decide history and restore for team projects

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:55.837Z
- Updated: 2026-10-18T17:43:58.567Z
- Closed: 2026-10-18T17:43:58.567Z

## Question

Git no longer keeps a team project's history: `design/` leaves git and Spool Cloud keeps the team's copy and its history (Decide where a team's design lives and how changes travel (#13)). What can a team roll back, and how?

- What a restore acts on: one file, one frame, a page, the whole team project at a moment, or some of these.
- Who may restore (admins, editors), and whether a restore is an ordinary new save that travels under the collision rule.
- Where history is browsed: the canvas, the team's page at [spool.page](http://spool.page), the CLI, or several.
- How set-aside saves show up in history, and how long they are kept. Research: what a team costs to run (#42) proposes 90 days; Decide what happens when two writers change the same file (#17) handed this here.
- Retention on free and paid teams. #42 proposes 5 GB compressed on paid and 1 GB and 90 days on free.
- What history records per save (who, which machine, when), and what a member who was removed leaves behind that may need rolling back (Decide what a teammate's files may do on your machine (#21)).
- Whether a moved-in project's earlier history, which stays in git, is linked from the cloud's history.

Blocks the team project sync spec.

*From Linear DEV-171.*

Related: #58, #73, #90, #94, #96, #101, #105, #114, #42, #21, #17, #13, #3

Plane: SPOOL-57

## Comments

### agent, 2026-10-18T17:43:58.560Z

**Liam, 2026-10-10:** ## Resolution (grilling with Cata, 2026-10-10, agent-hub task 108)

Cata took every recommendation and asked for the fewest possible CLI commands.

- **Restore is one action at any size.** An editor puts a file, a frame, a page or the whole team project back to how it stood at a chosen moment, a deleted file included.
- **A restore is ordinary new saves on top.** History is never rewritten, so a restore can itself be undone. It travels under the collision rule like any save, and like moving in it counts against no save limit.
- **Who:** any editor restores. Viewers can read history but not restore.
- **Where:** in the app, a frame's history from its menu and the whole project's from the project. Agents get one read-only command, `spool history <path>`, which lists a file's versions; `--at <time>` prints one. The agent writes an old version back itself as an ordinary edit (ADR 0005). spool.page has no history page at launch.
- **No git behind the scenes.** Cata asked about it. The sync object already stores saves the way git does (each version by content hash, plus a log of who, which machine and when) without branches and merges, which #13 and #17 ruled out. Real git would mean a JavaScript git in the sync object with one commit per save, or every Mac holding a history clone. Figma, Google Docs, Notion and Dropbox all keep their own version log. Git fits as an export format: noted on Decide deleting an account and taking your data with you (#101).
- **Kept 90 days:** every save, applied or set aside, then deleted. The current files are never deleted. Spool Cloud is paid only (#90), so there's no separate free-tier rule.
- **What a save records:** what it records today (who, which machine, when, applied or set aside), plus restores marked as such. History can be filtered by person. There's no "undo everything one person did": a removed member's damage is restored file by file, or the project is restored to a moment.
- **Before the move:** the team history opens with "moved in from git", naming the commit that took `design/` out. Text only, no link.
- **Backups are separate from history:** Spool's own daily copy of each sync object to R2, kept 30 days and restored only by us (#94's must-have).
- **Left to others:** what a removed project's copy and history become goes to Decide how a project leaves a team (#100). A lapsed team's cloud copy, history included, goes after 6 months (#90). How history looks goes to a new prototype ticket.

Glossary: **Team history**, **Restore** and **Backup** in `spool-cloud/GLOSSARY.md`, branch `108-wayfinder-dev-240` (3578d52). "Team history" keeps it apart from core's **History**, the daemon's git commits.

For the sync spec: today nothing is ever deleted, so a 90-day purge of saves and of blobs no longer referenced is needed (also what #73 waits on).
