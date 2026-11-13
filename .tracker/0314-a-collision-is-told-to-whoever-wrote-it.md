# #314 · A collision is told to whoever wrote it: the agent in its CLI, a person by a quiet count

- State: closed
- Labels: ready-for-agent, enhancement
- Created: 2026-11-12T10:26:41.138Z
- Updated: 2026-11-12T14:16:08.402Z
- Closed: 2026-11-12T14:16:08.402Z

## Why

When a save to a team project stays set aside, the only one told is a person: a banner across the canvas with "Use theirs / Use mine / Ask agent to fix". The agent that wrote the file is never told (no CLI command reports a set-aside mark), so it goes on believing its work landed, and the person is asked to judge two versions of a file he wrote neither of. Collisions are judged per file and base version, so two local copies signed in as the same account collide like two people, and the notice then reads "You and Liam Vinberg both changed …" to Liam Vinberg. The line of text also runs under the buttons when the name is long.

A separate ticket makes `frame.json` stop colliding; this one is about who hears of the collisions that remain (real overlapping edits to source files).

## What to build

### The agent is told, and can settle it

- **Told first.** An agent's command on a team project already prints what didn't travel (`readUntold` in `src/verbs.ts`, `/sync/untold` in `src/daemon/team-sync.ts`). A set-aside mark in this local copy is told the same way, once per mark: which file, who won (a teammate by name, or "another copy of you", with the machine when it is known), that the file on disk is now the winner's, where its own bytes are kept (`design/.spool/set-aside/…`), and what to do: redo the change on top of the file and save it (a save already clears the mark), or settle it with the command below.
- **`check` fails while a mark stands** in this copy, with the same explanation. An agent must not finish believing work landed that didn't.
- **A command to settle it**: lists this copy's marks with no arguments; takes mine for a path (puts the kept bytes back as a new save, what "Use mine" does); takes theirs for a path (drops the mark, what "Use theirs" does). Name and shape it the way `src/cli.ts` names its other verbs, in the glossary's words (Collision, set aside). It goes through the daemon's existing set-aside routes (`src/daemon/set-aside-routes.ts`).
- **The skill says so** in a line or two where it covers team projects (the packaged Markdown `pnpm -s dev skill` prints), so an agent knows what the message means before it meets one.

### The person gets a quiet count, in words that are true

- **No banner.** The notice across the canvas goes. In its place a small count in the chrome, where the project's sync or team state sits (read `design/AGENTS.md` and the chrome before placing it): "1 set aside". Nothing pops up or animates when a mark arrives. Opening it lists each collision with today's sentence and the same three actions; today's grouping of many files from one clash stays. No marks, no count.
- **Same account.** The marks already keep the winner's account and device, and the daemon knows its own account. When the winner is the same account the sentence is "Two of your copies both changed X", or "This copy and your copy on <machine> both changed X" when the machine's name is known, and the actions read "Use the other copy's" and "Use this copy's". A teammate keeps "You and <name> both changed X", "Use theirs", "Use mine". The prompt "Ask agent to fix" writes says the same.
- **Long names** are cut with an ellipsis and never run under the actions.
- Build it from `src/ui/primitives/` and the theme's roles; no new look. `design/frames/app/` mirrors what ships, so redraw the frame that shows this notice.

## Decided, and why

- The model stays: first save stands, the later one is set aside and kept. Turned down: "latest save always wins", because an agent on an old copy would silently overwrite newer work.
- No designer round: Liam asked for a quiet count reusing what exists.
- Marks stay per local copy. A team-wide view of unsettled collisions is out of scope.

## Done when

- In a copy with a set-aside source file: the next CLI command says so once, `check` fails, the new command lists it, and mine and theirs each settle it; saving the file again clears it as today.
- The canvas shows the count and no banner; the list's wording differs for a teammate and for another copy of the same account; a long path doesn't overlap the actions.
- One changeset per `docs/releases.md`. `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Tests

The wording as a function (`src/ui/canvas/set-aside.test.ts` is there; extend it). The CLI telling and the command once at the daemon or CLI level, beside the existing untold and history CLI tests. `src/daemon/set-aside-browser.test.ts` proves the canvas wiring: change it to the count and list, don't add a second browser test.

## Leave alone

The merge and send logic in `team-sync.ts` (the other ticket is changing `mergedWith` and `answered()`; touch only what telling needs), set-aside storage, Team history, and Spool Cloud.

## Comments

### agent, 2026-11-12T14:16:08.402Z

Built in task 628, merged to main in PR #436 (https://github.com/liamvinberg/spool/pull/436). Two reviews; findings fixed with tests.
