# #322 · A rehearsal for agents: one verb plays a whole talk in the real stage and says what broke, what moved wrong and what lagged, with a sheet to look at

- State: closed (done: merged to main)
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-12T16:36:35.709Z
- Updated: 2026-11-12T21:42:25.764Z
- Closed: 2026-11-12T21:42:25.764Z

## Why

Liam makes talks (decks, experiment `deck`) with agents and will show them to clients. His words: "its agent native so we must make it as a good environment for agents as possible ... A validation loop is always important so it gets if it lags or like can validate almost 'see' the presentations?"

A scout read the whole transcript of the thread where 19 agents made 25 decks (task 629). Its notes, with the evidence for everything below, are `~/.brain-archive/agent-decks/frictions.md` on devobee: read it first. In short: every agent ran `spool check` and took stills (`spool shot`, `--beat`), reported "passes", and most never saw their talk play. Stills and check could not show them: the move between beats, the transition between slides (seven agents shipped transitions they had only reasoned about), a view transition cancelled because a name appeared twice (eight agents hit demo screens carrying names of their own), pictures arriving after the entrance had played (a slide empty for 2 s on first visit), a slide that only breaks in the stage, the stage black for 15 s, content clipped at the slide's edge, how many WebGL contexts a slide holds (the stage keeps two ready, `src/runtime/deck/stage-webgl.ts`), or lag. Four agents found the talk's play address by reading spool's source and drove a browser by hand to see it.

## What to build

One verb an agent runs on a deck page that plays the talk from the first beat to the last and back, in the real stage (the same composed document the presenter view, the room and full screen use: `src/runtime/deck/`, the play address in `src/daemon/deck/stage-play.ts`), in the pinned headless browser spool already has for the photo booth, and reports in the plain style of `spool check`. Working name `spool rehearse <page>` (the name is Liam's to change; keep it in one place).

It reports, per slide and beat, only what is wrong, each as one line an agent can act on (file where it can name one, what happened, what to do):
- a slide that threw, never became ready, or was still loading when its key came, with the error;
- console errors and failed requests while it played;
- a transition between slides that did not run or was cut short, with the reason when it is knowable (a `view-transition-name` used twice, and by which elements);
- pictures or fonts that arrived after the slide was shown;
- content outside the slide's box at rest, on any beat (not what the slide clips on purpose: say how you tell them apart, and prefer saying nothing to a false alarm);
- an element that changes the layout between beats (the skill says to reveal without moving the layout);
- a slide holding more WebGL contexts than the stage keeps ready, with the count;
- the time from each key to the change, and frames missed during each step and transition, when the machine can tell (it runs on a real GPU or says it cannot judge, as the booth's timing does; under heavy load it says so rather than blaming a slide). #318 (task 638) adds the per-slide cause of slowness to `spool check` from the booth's timings; use what it built rather than a second way, and say in the output where the two meet.
- and at the end one summary line, and a non-zero exit only for what is broken (a throw, a slide that never loads, a transition that cannot run), not for what is slow.

And it lets the agent see the talk: it writes a contact sheet of every beat at rest in order, labelled with slide number, name and beat, and for every transition between slides three frames from inside it (start, middle, end), so a move can be judged from pictures. Say in the output where the files are, in a place the agent chooses or is told plainly (today's shots land in `design/.spool/verify/` with numeric beat names, which six agents had to copy out by hand). One slide or a range can be rehearsed alone.

It must be dependable where today's verbs were not (the scout's section 1): it never fails with "did not finish booting" on a healthy talk, works when several agents run it at once on a shared daemon, never shows a state from before the last save, and finishes a 12-slide talk in a time you report. It does not need the Mac app or a window.

The skill (`skill/topics/deck.md`, `skill/overview.md`, `skill/topics/verbs.md`; follow the writing-for-agents skill) then tells agents: write the talk, run check, rehearse it, look at the sheet, fix, repeat; and that a talk is not done until it has been rehearsed clean.

## Leave alone, and who else is here

The stage's behaviour while presenting (task 646, #320, is making stepping never lag), the Present flight and the booth's covers (task 642, #319), the booth's timing and `spool check`'s slow notes (task 638, #318), `ui.beats is not a function` (task 647, #321). A sibling ticket fixes `spool shot`'s own failures and the skill's gaps; do not fix shot here beyond what rehearse shares with it. Pull main often. The 7767 daemon is shared: never stop it; use a lane of your own. The decks to try it on are the team canvas's `explore/deck-kit/*` (fetch with `pnpm -s dev open .`); do not edit them (task 629 owns them): send what rehearse finds in them to task 629 with message_task, as a list.

## Done when

- On a talk made for the test with one of each fault above and clean slides between, rehearse names each fault at the right slide and beat and says nothing about the clean ones (a browser test for the wiring; the wording and each rule as functions).
- Run on five of the kit decks: the output and sheets are saved in `~/.brain-archive/agent-decks/rehearse/`, with a line per deck on whether what it said was true when you looked.
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a minor); merged to main with CI green, not released (nothing is being released; main reaches Spool Beta by itself).
- A message to task 557 with the verb's output for one kit deck and its sheet's path, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T19:34:26.189Z

New rule for spool builders, in force now (AGENTS.md on main, 0fcbedcc; from devops task 654, confirmed by task 557): do NOT run the full `pnpm test` on devobee any more. It takes about 4 minutes in CI and up to an hour here, and it is most of what overloads the machine. Locally run only `pnpm test:changed` (plus any suite it misses with `pnpm vitest run <path>`), `pnpm typecheck` and `pnpm check`. For the full suite: push your branch, then `gh workflow run ci.yml -R liamvinberg/spool --ref <branch> -f darwin=false` (opening a PR starts the same run), find it with `gh run list -R liamvinberg/spool --workflow ci.yml --branch <branch> --limit 1`, wait with `timeout 900 gh run watch <id> -R liamvinberg/spool --exit-status`, and merge only on green. Leave darwin on only if you changed macOS-specific code (desktop/). If CI fails, reproduce the failing file alone, never the whole suite. If a full local run is going right now, stop it and use CI. This replaces the ticket's line about the full `pnpm test`.

### agent, 2026-11-12T21:42:25.764Z

Merged to main in 582f63d1 (task 648), CI green, not released. `spool rehearse <talk> [--slides 3-5] [--out]` plays a talk forward and back in the stage, writes its sheets and stills, and says where each finding is. Five kit decks are in ~/.brain-archive/agent-decks/rehearse/, with README.md checking each note against the code. sys-alive (12 slides) takes 88 s at load 7.
