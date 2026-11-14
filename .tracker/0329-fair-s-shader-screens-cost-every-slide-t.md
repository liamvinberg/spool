# #329 · Fair's shader screens cost every slide that shows them: same look, a fraction of the work

- State: closed
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-13T08:35:42.060Z
- Updated: 2026-11-13T09:42:13.244Z
- Closed: 2026-11-13T09:41:53.226Z

## Why

Liam's talks step with lag ("it should run smoothly ... never laggy"), and the decks he will show clients are built around live Fair screens (the demo app on the team canvas). Task 646 (#320) spent a night on spool's side and measured what is left: with the slides' WebGL switched off, the heaviest deck's steps drop from 605 to 73 ms at p95 in the presenter view. Its notes: `~/.brain-archive/deck-step/README.md` on devobee ("What is left, measured"), with the per-slide list in `steps.md`. Read them first.

The cause on the slide's side is one component, `design/shared/ui/demo/fair/shader.tsx` (230 lines), used by `now.tsx`, `day.tsx` and `radar.tsx` beside it:
- it draws on every animation frame for ever (a sky that drifts at `u_time * .012`, a radar), at up to 1.5x, into a `webgl2` context made with `preserveDrawingBuffer: true`;
- each `<Shader>` makes its own context: FairNow 2, FairDay 2, FairRadar 1, so a slide with three phones holds 5, and Chrome allows 16 per process;
- it sizes its canvas from its own client size in a ResizeObserver;
- kit-explainer's `CanvasScene` (in `design/shared/ui/explore/deck-kit/`) shows several such screens at once.
On the m1 a context took 20 to 90 ms to make; the GPU process was 70 to 98% busy drawing these while a talk stepped.

## What to do

Make a Fair screen cost as little as it can while looking the same to the eye, on the team canvas (`design/` in this checkout after `pnpm -s dev open .`; every save reaches the team within a second, so work carefully and in small saves):
- draw only as often as the picture visibly changes (the sky drifts slowly: find the lowest rate at which the drift still reads as continuous, or draw on a change of uniforms and time step; a still when `prefers-reduced-motion`, as today);
- draw nothing when the screen is not visible (off screen, hidden, in a slide waiting out of sight: spool marks the slide on show with `[data-spool-stage-shown]`, and holds a waiting slide's contents with `content-visibility: hidden`);
- no `preserveDrawingBuffer` unless something needs it (find out what did: thumbnails and `spool shot` must still show the sky, check both);
- fewer contexts: one per phone at most, and if it is simple and safe, one per slide shared by its screens (say what you chose and why);
- `CanvasScene`: screens that are small or out of focus as stills where the eye cannot tell.
Do not change the look, the colours or the feel of the motion: that is Liam's taste and it is set. Prove the look with `spool shot` of the same frames before and after at the same moment (`--at`), and the motion with a short sheet of frames over a few seconds, saved in `~/.brain-archive/deck-step/fair/`.

## Who else is here

- The kit decks and the Fair demo are used by task 629 (Liam's template decks, `explore/deck-kit/*`) and by `site/demo` frames. Message task 629 before your first save (what you are changing and that the look stays) and when done. Do not edit the decks' own slides beyond what the shared components need.
- A sibling ticket changes spool's stage for heavy slides and measures the talks on the m1 before and after your change; its builder will ask you when the new shader is saved. Tell it (and task 557) the moment it is.
- `design/` is out of git: nothing here is committed or merged. If the skill's deck topic should say something new from what you learn (`skill/topics/deck.md` is at its 12,000-character limit: replace a sentence, do not add), that part is a normal branch, CI as `AGENTS.md` says, merged to main, not released.

## Done when

- `pnpm -s dev check` and `pnpm -s dev rehearse explore/deck-kit/kit-one-object` (and kit-explainer) are clean of new notes, and rehearse's WebGL counts per slide went down; numbers before and after in the archive folder: contexts per slide, draws per second at rest, GPU or frame cost if you can read it on devobee's GPU.
- Shots before and after match (say by how much), the motion sheet is saved.
- A message to task 557 with the numbers, and to task 629. When it is merged or done, or before any choice the ticket does not settle, message task 557 (message_task) with a few lines. Put a time limit on every command that could wait for input. Close this task yourself once it is done and reported.

## Comments

### agent, 2026-11-13T09:41:53.226Z

Done by task 667. The new shader was saved to the team canvas on 2026-11-13 at 10:32. It uses one WebGL context per document on an OffscreenCanvas, and each screen copies into a 2D canvas. It draws only while in view, at most 30 times a second, scaled by the size it is shown at, and has no preserveDrawingBuffer. Rehearse counts 0 contexts per slide, down from 5, and both decks rehearse clean. On kit-one-object/takes, devobee's GPU went from 305 to 82 draws a second and from 180 to 70 ms a second. Shots at the same moment differ by a mean of 0.5/255. The numbers, shots, motion sheets and harness are in ~/.brain-archive/deck-step/fair/README.md.

### agent, 2026-11-13T09:42:13.244Z

Done on the team canvas (saved 2026-11-13 10:32), judged in task 557 from ~/.brain-archive/deck-step/fair/ (old and new shots look the same).
