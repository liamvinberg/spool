# #318 · spool check tells the agent which slides of a talk will lag, and why

- State: closed
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T12:02:07.133Z
- Updated: 2026-11-12T16:51:14.899Z
- Closed: 2026-11-12T16:51:11.957Z

## Why

Liam, on presentations (experiment `deck`): "i also want never laggy, it should run smoothly at 60 frames ... maybe the spool check should show this for when it checks this as a form of validation cause ofcourse it also depends on how the agent writes the code that its performant".

A talk can lag for two reasons. Spool's own part (the stage, the windows, stepping) is being fixed and measured in spool#316. This ticket is the other half: the slide's own code, which an agent wrote. Spool cannot make it fast, but it can notice and tell the agent what to change.

## What exists (a scout's notes with paths and lines: `~/.brain-archive/check-slides/scout.md` on devobee; read it first)

- `spool check` is offline: it typechecks and reads notes from disk, it never boots a frame (`src/cli.ts`, `src/check-command.ts`, `src/check.ts`).
- It already reports one cached measurement: after a frame is edited, the photo booth (a pinned headless Chromium, `src/daemon/booth.ts`) times how fast the frame draws at rest and keeps it in `design/.spool/thumbs/<frame>/pace.json`; under 45 frames a second, check says (`src/check-pace.ts`): "slow: drew 8 frames a second at Retina density when last timed (smooth is 60; its longest took 139 ms). While it plays it holds back the whole canvas." It is a note, not a failure, and it is skipped on a software GPU.
- That says a frame is slow, never why, knows nothing of beats, and its staleness check only looks at files in the frame's own folder, not the shared files it imports.
- The deck check (`src/daemon/deck/check.ts`) is disk only: `deck.json`, beats, notes.
- The deck's skill topic (`skill/topics/deck.md`) says to reveal with opacity, transform or clip and keep layout still, but nothing about cost.

## What to build

1. **Why, not only that.** When the booth times a frame, it also takes a cheap census of what the frame is doing, from inside the page, and keeps it beside the pace: the animations running (`getAnimations()`: which properties they animate, whether they run for ever, whether any property is one that forces layout or paint each frame rather than `transform`/`opacity`), the number of elements, canvases and their pixel sizes, WebGL contexts, videos, images whose natural size is far larger than the size they are drawn at, and whether a `requestAnimationFrame` loop keeps running at rest. These are facts about the code, the same on any machine. The scout's section 3 says what each can and cannot tell; respect those limits and do not claim more than a fact shows.
2. **Slides with beats are timed while they step.** A slide's cost is often in its reveals. For a slide of a deck page, the booth also times the frames while each beat enters (the same way it times at rest), and keeps the worst per beat.
3. **Check says it in the agent's terms.** For a slow frame, the note names the likely cause from the census and what to do, one line each, in the plain style of today's notes, for example: `animates left and width on 40 elements: these re-lay the page out every frame; move with transform`, `an animation that never ends keeps the slide drawing while you talk`, `a 4000 by 3000 image drawn at 400 by 300`. For a deck page, checking the page lists the talk's slow slides by number and name and says which beat was worst. A census finding alone, on a frame that timed fine, is not reported: no nagging about slides that run well. It stays a note that does not fail check, as today; say in the summary line how many slides of the talk timed slow.
4. **Staleness that is true.** The "timed before its latest edit" marker must also see edits to the shared files the frame imports (use the import closure check already resolves), so an agent that fixes a shared component is not told the old number as current.
5. **The skill says how to write a slide that runs smoothly**, in a few sentences in `skill/topics/deck.md` (follow the writing-for-agents skill): move and reveal with transform and opacity; nothing loops for ever unless the slide is about that motion; pictures at about the size they are shown; one canvas or WebGL scene per slide at most; and that `spool check` on the page names slides that timed slow and why.

Not in this ticket: recording frames during a real presenting run, anything shown in the presenter view, any fixed budget that fails check, anything in the stage (`src/runtime/deck/`, `src/ui/deck/`: task 636, spool#316, is working there; pull main often and read #316's comments for anything it learned about measuring a slide's cost).

## Done when

- A talk made for the test with one clean slide, one that animates layout properties on many elements, one with an endless animation, one with an oversized image and one whose third beat is heavy: after the booth has timed them (real browser test beside `src/daemon/booth-browser.test.ts`, on a real GPU as that test requires), `spool check` on the page names the slow ones with the right cause and beat and says nothing about the clean one. The wording and the cause picking are tested as functions (beside `src/check-pace.test.ts`).
- Editing a shared file a slide imports marks its timing as from before the edit.
- The booth's extra work is measured: say how much longer a timing takes per frame, and it must not slow the covers people wait for.
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a minor: check says more); merged to main with CI green, not released.
- A message to task 557 with the note's wording as it prints for that test talk, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T16:51:11.957Z

Merged to main (PR #437) and judged in task 557. Left as a known limit: an edit to a shared CSS file or image a slide imports does not mark its timing as old.

### agent, 2026-11-12T16:51:14.899Z

Merged to main as 3871e9e1 (PR #437), CI green, not released; minor changeset. The booth counts what a frame does while it times it, times each beat of a slide as it enters (after every cover, one timing at a time), and check names the causes and a talk's slow slides. Cost: the census adds 20 to 140 ms to a timing, and each beat after the first about 0.8 to 1.7 s. Covers are not slowed. Not covered: staleness follows check's source closure, so a shared CSS file or image the slide imports does not date its timing. Left open for task 557 to judge.
