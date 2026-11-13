# #323 · spool shot and the deck skill: the failures and gaps agents hit while making 25 decks

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T16:36:35.737Z
- Updated: 2026-11-12T20:15:45.444Z
- Closed: 2026-11-12T20:15:45.444Z

## Why

A scout read the transcript of the thread where 19 agents made 25 decks on the team canvas (task 629). Its notes, with the transcript item for each finding, are `~/.brain-archive/agent-decks/frictions.md` on devobee: read it first. Liam: "its agent native so we must make it as a good environment for agents as possible and optimize." This ticket fixes what tripped them in the verbs and the skill as they are. (A sibling ticket adds a verb that plays a whole talk; not here.)

## What to fix, each reproduced first

1. **`spool shot --at <ms>` fails with "the frame did not finish booting within 49 s"** on slides with delayed animations (above 1000 ms on some, on every try for others), and with `--beat` and `--at` together; a failing call took 2 to 2.7 minutes of wall time. Plain shots of the same frames work.
2. **Several shots at once or in a row fail** with the same boot message (eight slides together: two failed; alone, both fine). Agents work in parallel on a shared daemon: shots must queue, not time out.
3. **A shot right after a save shows the frame as it was before** (two agents; one had to touch the files). A shot must be of the saved source, or wait until it is.
4. **`spool check` passed a theme stylesheet that `spool shot` then refused** (`@import "shared/tokens.css"`: "only tailwindcss and relative stylesheets resolve"). Check must say what the compiler will refuse. Also say at check time when a remote font `@import url(...)` comes after `@import "tailwindcss"`, which fails later.
5. **Where a shot lands and what it is called**: always `design/.spool/verify/`, beats as `.beatN.png`, and the summary does not say the file. Let the agent say where (an output option), name a beat's file by the beat, and print the path.
6. **`--beat` counts from 1 while `ui.beats` counts from 0**, and `--beat 0` is refused. Keep 1-based and names, but say so in the refusal and in the skill; `skill/topics/verbs.md`'s usage line lacks `--beat`.
7. **`spool url <deck page>`** answers that no such frame exists. It should give the address that plays the talk (two agents dug `/play/<project>?deck=<page>` out of the source).
8. **One shot looked lighter than the real deck** (`kit-frames`, the `figure` slide: font weight 500 computed in both). Find out why or show it does not reproduce.
9. **The skill's deck topic** (`skill/topics/deck.md`; follow the writing-for-agents skill, few sentences each, only what an agent cannot find by trying): how a shared element's transition behaves in the stage (which slide's CSS applies during the move, stacking of a named layer, that `!important` was needed and why or fix the ordering so it is not); that hidden slides stay in the document, so `html:has(...)` and names inside embedded demo screens leak across slides, and how to quiet a demo's own `view-transition-name`s; that the stage gives no forward or back type to a transition (or add one if it is cheap and say so to task 557 first); how many WebGL contexts the stage keeps ready and what happens past that; that `ui.go`/`ui.back` do nothing in a talk; `design/AGENTS.md`'s `theme.css` rule as it applies to a deck's own stylesheet.

Not here: the daemon becoming unreachable when many agents and test suites load the machine (about 450 requests queued at load 150 in that thread) is its own ticket; do not chase it, but do not make it worse, and note anything you learn about it there.

## Leave alone, and who else is here

The stage (task 646, #320), the booth and covers (tasks 638 and 642), the new rehearse verb (its own ticket). Pull main often. The 7767 daemon is shared: never stop it; use a lane of your own.

## Done when

Each of 1 to 8 has a test that failed before (or a note that it does not reproduce, with what was tried), at the cheapest level that shows it; the skill's additions are in; `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a patch); merged to main with CI green, not released. A message to task 557 with a line per item, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T19:34:26.279Z

New rule for spool builders, in force now (AGENTS.md on main, 0fcbedcc; from devops task 654, confirmed by task 557): do NOT run the full `pnpm test` on devobee any more. It takes about 4 minutes in CI and up to an hour here, and it is most of what overloads the machine. Locally run only `pnpm test:changed` (plus any suite it misses with `pnpm vitest run <path>`), `pnpm typecheck` and `pnpm check`. For the full suite: push your branch, then `gh workflow run ci.yml -R liamvinberg/spool --ref <branch> -f darwin=false` (opening a PR starts the same run), find it with `gh run list -R liamvinberg/spool --workflow ci.yml --branch <branch> --limit 1`, wait with `timeout 900 gh run watch <id> -R liamvinberg/spool --exit-status`, and merge only on green. Leave darwin on only if you changed macOS-specific code (desktop/). If CI fails, reproduce the failing file alone, never the whole suite. If a full local run is going right now, stop it and use CI. This replaces the ticket's line about the full `pnpm test`.

### agent, 2026-11-12T20:15:45.444Z

Merged to main (f44d0205), CI green, judged in task 557.
