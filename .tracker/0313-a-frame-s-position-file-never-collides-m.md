# #313 · A frame's position file never collides: merge frame.json by field

- State: closed
- Labels: ready-for-agent, bug
- Created: 2026-11-12T10:26:41.125Z
- Updated: 2026-11-12T14:16:08.122Z
- Closed: 2026-11-12T14:16:08.122Z

## Why

In a team project a person keeps getting the set-aside notice ("You and <own name> both changed <frame>") without editing anything. About half of the logged collisions on Liam's machines are `frame.json`. The cause is in the code: every daemon that lists a project's frames gives an unplaced frame its position and writes `frame.json` (`placeFrames` in `src/daemon/projection.ts`, `writePlacement` in `src/daemon/geometry.ts`). When an agent authors a frame with a size and no position, its own daemon and every other daemon with the project open each pick a spot and save it. The first save stands, the others are collisions, and a four-line JSON file can't merge by line. So a person who is only watching is asked to choose between two machine-picked positions.

## What to build

1. **`frame.json` never stays set aside.** Where a `frame.json` save is set aside, the daemon that lost merges it by field instead of by line, in the same place the line merge happens today (`mergedWith` in `src/daemon/team-sync.ts`; `mergeCanvas` and `mergeKeys` in `src/team-sync-protocol.ts` are the prior art). From the version both were built on (none counts as empty):
   - a field the save changed from a value it had in the base lands on the team's version (the later move or resize wins);
   - a field the save added that the team's version already has keeps the team's value (the first placement stands; this is the race above);
   - `x`, `y`, `w`, `h` are never removed by a merge: an agent rewriting a placed frame's sidecar as size only must not unplace it for the team. Other keys (`placeholder`) are removed when the save removed them;
   - a merge equal to the team's version sends nothing: disk takes the team's bytes, no mark, no notice, no log line that reads as a problem;
   - otherwise the merge is written and sent as a new save, as a line merge is;
   - where either side isn't a JSON object, it collides as any file does today.
2. **No second collision from one edit.** After a save is answered as set aside, that path sends nothing more until the team's version of the file has arrived and the merge has been tried. Today `answered()` can resend newer dirty bytes on the old base before the winning file lands (around `team-sync.ts` 1421 to 1451; Cloud sends answers before files), which sets the same edit aside twice.
3. `GLOSSARY.md`'s **Collision** entry says `frame.json` never collides either, and how.

## Decided, and why

- The merge lives in the daemon, not in Spool Cloud. The merge of a collision is already the losing machine's job, older clients keep working, and nothing has to deploy. **Leave spool-cloud alone.**
- Daemons keep placing frames they discover. Stopping receivers from placing was turned down: with the field merge the race is harmless, and a frame whose author never places it still gets a position.
- Last write wins per field for real moves, matching `canvas.json`.

## Done when

- Two daemons that place the same new frame differently end with the same `frame.json`, no mark under `.spool/set-aside`, and no notice.
- A move on one machine and a resize on another, built on the same version, both land.
- A size-only rewrite that collides with a move leaves the frame placed.
- An edit made right after a set-aside answer is not set aside a second time.
- One changeset (patch) per `docs/releases.md`. `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Tests

Prove the merge rule once as a function beside `mergeCanvas`'s tests, and the wiring once at the daemon level beside the existing collision cases in `src/daemon/team-sync.test.ts` (first save wins, automatic line merge, canvas key merge). Extend those cases where you can. No browser test.

## Leave alone

The canvas notice, the CLI, set-aside storage and routes (another ticket changes who is told), `canvas.json`'s merge, and Spool Cloud.

## Comments

### agent, 2026-11-12T14:16:08.122Z

Built in task 628, merged to main in PR #436 (https://github.com/liamvinberg/spool/pull/436). Two reviews; findings fixed with tests.
