# #320 · Deck: stepping to the next slide never lags, on real talks (the next slide is warm before the key)

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-12T15:31:26.020Z
- Updated: 2026-11-13T08:35:42.068Z
- Closed: 2026-11-13T08:35:42.068Z

## What Liam saw

Spool Beta 0.56.1-beta.24 (it has #316), presenting the talks being made in task 629 (the template decks on the team canvas under `explore/deck-kit/`: `kit-ink`, `kit-frames`, `kit-bloom`, `kit-essay`, `kit-one-object`, `kit-explainer`). His words: "switching slides lags sometimes, we should like precompile and optimize i guess wamr up the next slide atleast. So that it doesnt lag when we transition to the next slide". Earlier: "i also want never laggy, it should run smoothly at 60 frames or whatever the minimum is, so that when you step through frames it doesnt like degrade".

## What is known

- #316 (merged, `324b16ce`; its notes are in `~/.brain-archive/present-blurry/README.md` on devobee, and a comment on #316 says how it measured) found stepping clean, 5 to 18 ms to show a step and p99 10.3 ms per frame, but on a talk of 30 plain slides. Real slides were not stepped.
- The kit decks are not plain: slides move a shared element between slides with `view-transition-name` (the deck topic of the skill, `skill/topics/deck.md`, teaches this), have several beats, real fonts and pictures, and some hold live demo screens with WebGL. A designer in task 629 noted: the stage keeps at most two WebGL contexts (`WEBGL_KEPT = 2`, `src/runtime/deck/stage-webgl.ts`), "Every Fair slide uses at least two, so slides aren't prepared ahead and each step onto one may pause a moment while it loads", and that nobody had checked how a slide's own `::view-transition-*` rules behave in the stage.
- #305 found that the first time a new document or kind of content is drawn, the GPU process compiles a pipeline, 200 to 250 ms with cold caches. A slide that is loaded but never painted may still pay that on its first frame.
- The stage: `src/runtime/deck/stage.tsx` (one composed document holding the talk's slides, not an iframe per slide), `stage-warm.ts`, `stage-webgl.ts`, `stage-host.ts`; its hosts are the presenter view (its own slide and the next pane), the room's window and full screen (`src/ui/deck/`, `src/runtime/deck/room-host.ts`).

## The rule (decided in task 557)

Whatever the next key plays is ready before the key, in every window that will show it: its code loaded and run, fonts and pictures decoded, laid out, and drawn once where the GPU has seen it, so the step itself is one cheap frame. The same for the step back. A step never waits for loading and never drops frames because of spool. If a slide's own code is what costs (a heavy scene starting up), that is the slide's, and #318 (`spool check` naming slow slides, task 638) is where the agent hears it: say which lags are which.

## What to do

Follow the diagnosing-bugs skill: reproduce and measure before fixing. On the m1 in the Mac app built from main, with the team canvas fetched (`pnpm -s dev open .` in your worktree; the decks are under `design/frames/explore/deck-kit/`): step forward through every beat and slide of each kit deck and back again, in the presenter view with the room's window, on a second (virtual) display, and full screen, cold (app just started, GPU caches emptied as #305 did) and on a second pass. For every step record: key to the first frame that shows the change, the longest frame and the frames missed during the step and its transition, and what the main thread and GPU were doing in the slow ones (a trace). Name the causes, each with its share. Suspects, none confirmed: slides with WebGL not prepared ahead because of the limit of two; a first paint of a slide never drawn before; view transitions capturing large layers; pictures or fonts decoded late; three live copies of a slide starting at once; modules of later slides loaded lazily.

Then fix spool's part to the rule. The limit of two WebGL contexts was a decision of the deck's spec (#265), made so the stage never loses a context to the browser's cap: if the fix needs it changed (for example the next slide's scene made ahead in the room only, or a higher limit with a count across the talk's windows), bring what you propose and its risk to task 557 before building it. The same for anything that changes what a presenter or the audience sees.

## Leave alone

Present's flight and its pictures (task 642, spool#319, is working there and in the photo booth), `spool check` and the booth's timing (task 638, spool#318). Pull main often. The m1 is shared: your own lane and port, quit only what you started. Do not edit the kit decks themselves (task 629 owns them); if a slide's own code is slow, report it to task 629 with message_task, with the slide and the cause.

## Done when

- The causes are named with numbers, before and after, per deck, in `~/.brain-archive/deck-step/` on devobee (a README, the per-step table, a chart of frame times across a whole pass).
- After, on the m1, cold and warm, in all three hosts: no step on any kit deck takes more than 50 ms from key to change or misses more than one frame because of spool; what remains is listed per slide as the slide's own cost, with the evidence.
- A browser test where one can see the rule (before a key, the slide and beat it will play are loaded, laid out and have been painted), and `skill/topics/deck.md` says what an agent must know (how many WebGL scenes a talk can keep ready, how view transitions behave in the stage), in a few sentences, following the writing-for-agents skill.
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a patch); merged to main with CI green, not released (nothing is being released; main reaches Spool Beta by itself).
- A message to task 557 with the causes, the numbers and what is left, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T19:34:25.965Z

New rule for spool builders, in force now (AGENTS.md on main, 0fcbedcc; from devops task 654, confirmed by task 557): do NOT run the full `pnpm test` on devobee any more. It takes about 4 minutes in CI and up to an hour here, and it is most of what overloads the machine. Locally run only `pnpm test:changed` (plus any suite it misses with `pnpm vitest run <path>`), `pnpm typecheck` and `pnpm check`. For the full suite: push your branch, then `gh workflow run ci.yml -R liamvinberg/spool --ref <branch> -f darwin=false` (opening a PR starts the same run), find it with `gh run list -R liamvinberg/spool --workflow ci.yml --branch <branch> --limit 1`, wait with `timeout 900 gh run watch <id> -R liamvinberg/spool --exit-status`, and merge only on green. Leave darwin on only if you changed macOS-specific code (desktop/). If CI fails, reproduce the failing file alone, never the whole suite. If a full local run is going right now, stop it and use CI. This replaces the ticket's line about the full `pnpm test`.

### agent, 2026-11-12T22:09:36.513Z

From task 557, for task 646 (message cap reached, so it is here): task 642 measured the room on a second (virtual) display drawing its slide at +1.1 to 1.2 s after the press (recordings in ~/.brain-archive/present-blurry/319-runs/*-room*.mov), where #316 measured the room live at +364 ms cold. Since you are in the room for step 3: say which is right today on main, and if it is the slower one, what changed and whether the room's own process brings it back. The audience should see the slide well under half a second after the press.

### agent, 2026-11-13T08:35:42.068Z

Eight steps merged (last a99c9756), judged in task 557 from ~/.brain-archive/deck-step/. Slides are always ready at their key now and the middle step is faster, but the 50 ms bar is not met on the heavy kit decks. Carried on in #329 (Fair's shader on the team canvas) and #330 (the stage protects the step; measured at a talk's pace on a quiet m1). The room-open time question from #319 went to #330.
