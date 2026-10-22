# #205 · Offline after 30 s, and Match the team

- State: closed
- Labels: ready-for-agent
- Parent: #117
- Blocked by: #204
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:56:11.344Z
- Updated: 2026-10-21T20:57:19.988Z
- Closed: 2026-10-21T20:57:19.988Z

## Parent

Spec: running Spool Cloud for paying teams (#117)

## What to build

What a member sees when sync can't work, and their own fix. `SyncState` gains `offline`: true after 30 seconds without a caught-up connection, while the copy is followed and not ended, gone local or paused. The Sync box says "Offline. Your changes go up when you're back.", and the line goes the moment the connection is caught up again; a blip under 30 s shows nothing. **Match the team** goes in the project tab's menu for team projects and as an action on the Sync box when it shows. It runs the lost-record repair from #204 on demand. It needs a caught-up connection, and offline it says so and does nothing. Every travelling path takes the team's version, and every local difference, additions included, becomes a set-aside mark. Files that didn't travel stay. The canvas's mirror frames for the Sync box and the tab menu are redrawn (canvas saves, never committed). Spans spool (daemon route, `SyncState`, canvas) and spool-cloud's team e2e.

## Acceptance criteria

- [ ] With spool.page unreachable for 30 s, the canvas shows the offline line; it goes when the line is back and caught up; a 10 s drop shows nothing
- [ ] e2e: Match the team on a copy with local edits, a local-only file and a local delete leaves the team's version on disk, and three set-aside marks that Put mine back restores
- [ ] A 30 MB file that didn't travel is untouched by Match the team
- [ ] Offline, Match the team says it needs a connection and changes nothing
- [ ] Match the team is in the tab menu of team projects only, and on the Sync box's lines
- [ ] `frames/app/spool-canvas--sync` and the tab menu frame show the new line and item
- [ ] Changeset for the published canvas and daemon change

## Blocked by

- #204

## Comments

### agent, 2026-10-21T18:01:53.168Z

Match the team is exposed as `POST /api/p/:project/match-team` (control token): 200 `{marked}`, 409 `{error:"offline", message:"Match the team needs a connection to spool.page. Nothing was changed."}` without a caught-up connection (or against a spool.page that doesn't make checks), 404 `{error:"not_team_project"}`. In the Sync box it stands on every line except ended/gone local (no team to match) and its own refusal line; a refusal is said as a Sync box line until closed. From the tab menu it focuses the tab first so the refusal shows in that canvas's Sync box. `offline` is never true alongside a pause, ended or gone local.

### agent, 2026-10-21T20:57:19.988Z

Merged: spool f5fe825d (merge 205 #117 …), spool-cloud 4bf3938 (merge 205 #117 …). Built: SyncState.offline after 30 s, the Sync box offline line, Match the team (POST /api/p/:project/match-team) in the team project's tab menu and on Sync box lines, refusal offline, changeset. Offline timing is proven in daemon tests (fake cloud), not in the e2e. design/frames/app/spool-canvas--sync and the tab-menu frame still need redrawing on the canvas (not done from here: canvas is read-only for this run).
