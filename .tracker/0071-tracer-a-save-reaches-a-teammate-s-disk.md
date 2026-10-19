# #71 · Tracer: a save reaches a teammate's disk and canvas

- State: closed
- Labels: ready-for-agent
- Parent: #65
- Blocked by: #69
- Created: 2026-10-18T17:43:55.978Z
- Updated: 2026-10-18T17:43:59.143Z
- Closed: 2026-10-18T17:43:59.143Z

## Parent

#65

## What to build

The thinnest live team project. `spool init --team <name>` creates a team project in Spool Cloud, writes a tracked `spool.json` holding only the project's link, writes `design/.gitignore` of `*`, and never puts `design/` in git. The daemon's history commits are off for team projects (amend ADR 0008 with the team-project exception). A sync Durable Object per team project, on hibernatable WebSockets, holds the team's copy and a history of who saved what from which machine, orders saves and relays them. The daemon sends each saved file whole and writes teammates' saves atomically as real files without echoing them back. `spool.json` is a second walk-up marker for every verb.

Build the team harness for this: spool-cloud's publication e2e harness grown to two real daemons with separate state folders and repos against one Miniflare cloud, with Playwright for canvases.

## Acceptance criteria

- [X] In the harness, a frame saved in editor A's local copy appears as identical bytes in editor B's `design/` and on B's canvas
- [X] Layout files and binary assets travel; camera, selection and compile cache don't
- [X] `design/` never appears in `git status` of a team project; no daemon history commit is made
- [X] Verbs resolve a project through `spool.json`
- [X] ADR 0008 amended
- [X] Solo projects behave exactly as before (existing tests green)

## Blocked by

- #69

*From Linear DEV-186.*

Plane: SPOOL-71

## Comments

### agent, 2026-10-18T17:43:59.133Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0, with team sync live on beta.spool.page and spool.page.

Decisions where the spec was silent:
- Only a Mac's own session may sync. Browsers use their own routes for the canvas and presence.
- No --name on init --team. The project takes its folder's name.
- init --team uploads before it returns, but doesn't start a daemon.
- After spool login, sync reconnects on its next retry.
- A spool.json that names another cloud is refused, so a public repo can't send your token elsewhere.

Nothing left on this ticket.

Check for Liam: on two Macs in Devosurf, init --team, commit spool.json, clone on the other, spool open. A save shows on the other canvas in about a second.
