# #321 · Slides throw on boot: "TypeError: ui.beats is not a function"

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T16:19:46.450Z
- Updated: 2026-11-12T20:23:27.380Z
- Closed: 2026-11-12T19:48:07.673Z

## What Liam saw

2026-11-12, on a slide of a talk on the team canvas (the decks task 629 is making under `design/frames/explore/deck-kit/`), the canvas shows the broken-frame pill: "threw on boot TypeError: ui.beats is not a function" (screenshot: `~/.brain-archive/agent-decks/ui-beats-not-a-function.png` on devobee). His words: "its getting this alot i dont know why, isnt beats a function do we have that in the skill?" ("it" is the agent making the decks, task 629; he sees it too).

## What is known

- `ui.beats` is real and documented: `skill/topics/deck.md` teaches `import { ui } from "spool"` and `ui.beats([...])`.
- There is exactly one `ui` object, in `src/runtime/frame-runtime.ts` (`export const ui`, with `beats: slides.beats`), there without any experiment gate since commit `8f7ebe70` (2026-11-10), so in 0.55.0, 0.56.0 and every beta.
- In task 629's worktree (`/home/liam/agent-hub/worktrees/spool/629-i-want-to-make-some-presentations/design`) 111 files call `ui.beats`, all of them frames importing `ui` from `"spool"`; no shared file calls it and nothing shadows `ui`.
- So a slide is being run against a `"spool"` module that has no `beats`: an older or different runtime than the source says. Not confirmed which. Suspects: a cached runtime bundle served after the code moved on (the checkout instance's `~/.spool-dev/bundled`, the Mac app's or browser's HTTP cache after an update, a service worker); a daemon still running from old source (the shared 7767 daemon is never stopped; several daemons run from worktrees); the frame served by another spool than the one that wrote it (the team canvas is opened by the released app, Spool Beta, the main lane on devobee port 7788, spool.page's viewer, and agents' checkouts, all on different versions); a second copy of the runtime in one document (a frame composed into another, a contact-sheet frame, the stage, the export, the photo booth's still) whose `ui` is built differently.

## What to do

Follow the diagnosing-bugs skill. Find where it happens before touching code: read task 629's transcript (read_task 629, and its workers' reports) for every place the agent met this error and what it was doing (check, shot, the canvas, the stage, the viewer), look in the daemons' logs (`pnpm -s dev logs`, `~/.spool-dev/daemon.log`, Spool Beta's `~/.spool-beta` on the m1) for the frames that threw and which spool served them, and reproduce it. Never stop the 7767 daemon or the main lane (7788); use a lane of your own (`SPOOL_DIR=/tmp/<lane>/state SPOOL_PORT=<free port>`).

Then fix the cause, not the symptom: a slide must never be run against a runtime older than the one its checker passed. If the cause is a stale cache, make the runtime's address or cache key change with its content. If it is two spools of different versions serving one team canvas, the frame must fail with a sentence that says so ("this spool is older than the canvas needs: update") rather than a TypeError from inside the slide, and say what you propose for the general case to task 557 before building more than that sentence.

## Done when

- The cause is named with a reproduction, and where Liam and the agent each hit it.
- A test that fails before and passes after, at the cheapest level that shows it.
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a patch); merged to main with CI green, not released (nothing is being released; main reaches Spool Beta by itself).
- A message to task 557 with the cause, the fix and anything a person must do once (update, clear a cache), and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T19:34:26.066Z

New rule for spool builders, in force now (AGENTS.md on main, 0fcbedcc; from devops task 654, confirmed by task 557): do NOT run the full `pnpm test` on devobee any more. It takes about 4 minutes in CI and up to an hour here, and it is most of what overloads the machine. Locally run only `pnpm test:changed` (plus any suite it misses with `pnpm vitest run <path>`), `pnpm typecheck` and `pnpm check`. For the full suite: push your branch, then `gh workflow run ci.yml -R liamvinberg/spool --ref <branch> -f darwin=false` (opening a PR starts the same run), find it with `gh run list -R liamvinberg/spool --workflow ci.yml --branch <branch> --limit 1`, wait with `timeout 900 gh run watch <id> -R liamvinberg/spool --exit-status`, and merge only on green. Leave darwin on only if you changed macOS-specific code (desktop/). If CI fails, reproduce the failing file alone, never the whole suite. If a full local run is going right now, stop it and use CI. This replaces the ticket's line about the full `pnpm test`.

### agent, 2026-11-12T19:48:07.673Z

Merged in f1c864c7 (task 647). Cause: Spool 0.52 (running since Nov 8 on the m1) and Spool Beta both had the team canvas open and shared one cover store. The old one has no `ui.beats`, failed the slides, and its failure record made the Beta canvas show them broken. Now each spool keeps its own failure record per frame (`error.<version>.json`), and the canvas, `spool check` and `spool logs` read only the serving spool's. A `ui` member a spool lacks now throws "ui.X is not in this spool. This spool is older than the canvas needs: update it." Liam still needs to quit Spool 0.52 on the m1 (or update it) once; old releases keep writing the shared record until they're replaced.

### agent, 2026-11-12T20:23:27.380Z

Merged to main (f1c864c7), judged in task 557.
