# #206 · An older Spool pauses with Update Spool, and the first to update moves the team's format

- State: closed
- Labels: ready-for-agent
- Parent: #117
- Blocked by: #201
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:56:11.358Z
- Updated: 2026-10-21T20:57:19.996Z
- Closed: 2026-10-21T20:57:19.996Z

## Parent

Spec: running Spool Cloud for paying teams (#117)

## What to build

A member on an older Spool is **Paused**, not refused in silence, and the first member to update moves the team's format forward. The sync object accepts the current `PROTOCOL_VERSION` and the one before it, and the protocols route from #201 reports that range. The object keeps the team's current format: a `canvas.json` save with a higher `format` raises it. A daemon whose `hello.format` is below the team's is closed with a new format close code. An unsupported protocol keeps 4406. Either close pauses the local copy as a fair-use limit pause does: files stay editable, changes wait on disk, and the copy asks again hourly at most. `SyncState` gains `update`. The Sync box says "Update Spool to keep syncing with <team>", with the desktop bridge's update button in the Mac app or the npm command in the CLI. The project verbs that print what didn't travel also print the pause. A team project's local copy migrates its design/ format only after it is caught up, and the migration's writes, unsent changes included, go up as ordinary saves. Solo projects keep migrating on first read. The **Paused** entry lands in spool-cloud's glossary from branch `110-wayfinder-dev-172`. Spans spool (protocol, daemon, canvas, verbs) and spool-cloud (sync object).

## Acceptance criteria

- [ ] e2e: a daemon speaking the previous protocol syncs; one two behind is paused with the update line, keeps its edits, and sends them under the collision rule once restarted on the current Spool
- [ ] e2e: a daemon on a newer format catches up, migrates, sends the result, and the team's format rises; a teammate on the old format is then paused with the update line and never writes old-format files to the team
- [ ] An updated daemon's unsent changes are migrated before they go up
- [ ] In the Mac app the update line's button starts the app update; in the CLI the line names the npm command
- [ ] The next `spool` verb in a paused copy says sync is paused and why
- [ ] A pause is never shown as Offline
- [ ] The protocols route reports both accepted protocols, and spool's publish check passes
- [ ] Glossary: Paused lands
- [ ] Changeset for the published daemon, protocol and canvas change

## Blocked by

- #201

## Comments

### agent, 2026-10-21T19:07:26.197Z

Built on branches 205-are-there-any-other-gaps-compared--run-update (spool) and 205-b117-update (spool-cloud). Decisions taken where the ticket was open:
- `ACCEPTED_PROTOCOLS = [PROTOCOL_VERSION - 1, PROTOCOL_VERSION]` and `CLOSE_FORMAT = 4426` live in spool's protocol module, with `canvasFormat(bytes)`. spool-cloud mirrors all three in `src/worker/sync/protocols.ts` until the pin moves, tested against the same literals.
- `SyncState.update` is `{ team, how: "app" } | { team, how: "cli", command }` or null. `how` is read off the running CLI's path: the Mac app's bundled copy is `app`.
- In the Mac app the update line's button is the bridge's `install()`. It shows only once the app has a downloaded update; until then the line points to Check for Updates in the Spool menu. A browser on an npm daemon shows the npm command.
- The pause also lifts when a later ask is accepted (for example after the cloud is rolled back), not only on a restart.
- The next `spool` verb says the pause once, the way it already says what didn't travel.
- The tab and cover read it as `syncPaused`.

### agent, 2026-10-21T20:57:19.996Z

Merged: spool f5fe825d (merge 205 #117 …), spool-cloud 4bf3938 (merge 205 #117 …). Built: ACCEPTED_PROTOCOLS = [PROTOCOL_VERSION-1, PROTOCOL_VERSION], CLOSE_FORMAT 4426, the object keeps and raises the team format, SyncState.update with the Update Spool line (app update button / npm command), pause with hourly-capped re-ask, verbs print the pause, team copies migrate only after catch-up, Paused glossary, changeset. e2e older-spool.test.ts passes (older sides staged with a raw socket client; daemon pause via fake cloud). design/frames/app/spool-canvas--sync needs the update line drawn.
