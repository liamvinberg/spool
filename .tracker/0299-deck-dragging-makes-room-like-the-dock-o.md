# #299 · Deck: dragging makes room like the Dock, on springs, and long talks stay one line

- State: closed
- Labels: ready-for-agent
- Blocked by: #283
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T21:04:24.103Z
- Updated: 2026-11-12T03:02:03.746Z
- Closed: 2026-11-12T03:02:03.746Z

## What Liam asked for (task 557, 2026-11-11)

"the drag and dropping interaction where it replaces a slide, like the mac dock, similar to that, think apple interactions as they are really nice". From six live takes (#296) he picked `drag-dock`: "drag dock i like most its just i dont need the label of what happens". He turned down slides that swell under the hand and a band that unfolds into rows ("magnify is too much lighttable aswell"). On long talks ("what if you have 100 slides, is the horizontal view the best?") the decision is to keep the one line, because the order is never in doubt and the slides you do not want sit below, and to make a long line work.

## What is wrong today

Decks ship behind the experiment `deck` (spec #265). On a deck page the top row (the band) is the talk and every other frame sits loose in a grid below. Dragging today decides by zones: a loose frame over a slide's left or right fifth inserts, over its middle trades the two; neighbours glide on a fixed 440 ms curve that keeps no speed; nothing lifts. At fit zoom on a long talk a slide is a dozen pixels wide, so the zones cannot be aimed at, and reversals flicker (#283).

## What to build

**The band makes room, as the Dock does. Nothing trades.**

1. **Lift.** A press becomes a drag after 3 px. The held slide lifts to 1.045 with a soft shadow, above everything else on the page, and follows the hand. If the picture layer cannot draw a frame larger than its place cheaply, say so in task 557 before dropping the lift.
2. **One gap.** While a held frame is over the band, the band closes the hole it left and opens one gap where a release would put it. The gap is read from the held frame's middle plus 0.3 of a slot ahead in the direction of travel, so a neighbour starts to move when about a quarter to a third of it is covered. The gap is the whole message: no outline, no label, no words about what will happen.
3. **A steady hand changes nothing.** The direction of travel turns only after 8 px back; a boundary is crossed only 6 px past it; the band's lower edge has 10 px of give. These are screen pixels. A hand trembling ±3 px on a boundary for two seconds moves nothing. The thresholds must behave the same at the ends of the band as in its middle (in the design the last slide moved at 30% going out and 79% coming back: make it even).
4. **Springs that keep their speed.** Every frame that moves is on its own spring, and a spring that is given a new target carries on from where it is at the speed it has, so a move reversed mid-flight turns round. Making room: 0.3 s, no bounce. While the band scrolls under the hand: 0.16 s, no bounce. Landing: 0.36 s, bounce 0.12, starting from where the hand let go at the hand's speed (measured over the last 90 ms, at most 4000 px/s, zero if the hand had stopped for more than 80 ms). A drop settles once.
5. **Numbers.** A held or landing slide carries its number in its own label and the number at its slot stands aside, so numbers swap without a cross-fade. A slide off the band has no number, and that is the only sign it has left the talk.
6. **In and out.** A loose frame dropped on the band always goes in at the gap. A slide dragged below the band leaves the talk, lands in the grid by today's rules, and the band closes. **Trading is removed**: take it out of the drag, and delete the trade operation and its notes swap where nothing else uses them (`src/deck/changes.ts`, `src/daemon/deck/change.ts`, the agent guide in `skill/topics/deck.md` if it names it). Several frames dragged together move as one block and the gap is as wide as the block.
7. **Esc** mid-drag puts everything back, on the springs. One drop is one undo, as today. With reduced motion, everything is set without animation.
8. **Long talks stay one line.**
   - Fitting a deck page never shrinks a slide below 120 px wide on screen: zoom = max(the zoom that fits max(5, n) slots, 120 / slide width). Past that the band runs off the window's sides. The view opens at the band's left end (36 px in) unless a slide is selected, in which case that slide is in view.
   - While dragging, within 72 px of a side of the canvas the band scrolls by itself (the camera pans). The speed grows with the square of how deep the hand is, up to 10 slots a second, and stops 36 px past the band's ends. The gap stays under the hand while it scrolls: direction is measured on the page, so a band scrolling under a still hand still moves the gap.
   - Choosing a slide in Pages or with the arrow keys brings it into view.
   - Nothing swells and nothing unfolds.

The design is on the team canvas (`pnpm -s dev open .` fetches `design/`; read `design/AGENTS.md`): frames `app/spool-deck` (a 5-slide talk) and `app/spool-deck--long` (100 slides); code in `design/shared/ui/spool/deck/drag.ts` (`DeckDrag`: the rules, run outside React, writing transforms straight to elements and telling React only when the drop target changes and when the slide lands), `spring.ts` (the spring and its four tunes), `field.tsx`, `long.tsx`. Follow it literally for feel and numbers.

## How it maps to the code

- `src/ui/deck/deck-drag.ts`: the zone rules go; the gap rule comes in as a pure function with its tests (held middle, direction, lead, hysteresis in, slot out).
- `src/ui/deck/deck-motion.ts`: `createFrameTween` (fixed 440 ms, no velocity) is replaced by per-frame springs. Keep the work per pointer move and per animation frame out of React.
- `src/ui/deck/deck-page.tsx`: the preview, the lift, the carried number, the edge scroll; decisions must follow the layout as it moves (today they are made against the layout as it was when the drag began, lines 154-194).
- The fit floor belongs with the deck page's layout and the camera (`src/deck/layout.ts`, `src/ui/canvas/camera.ts`), for a deck page only.
- Frames are drawn by the picture layer from each frame's place (`src/ui/canvas/picture-layer.ts`, `picture-plan.ts`, `frame-shell.tsx`); the daemon writes the new places after the drop (`src/daemon/deck/`), and the optimistic settle must not move anything a second time when the daemon answers.

## No flicker, proven

This replaces the code Liam reported flicker in. #283 (task 598) fixes the flickers that are not about the zones and adds a captured-frames suite (`src/daemon/deck-flicker-browser.test.ts`) and a 60 fps recording harness for the m1: this ticket waits for it. Extend that suite to prove: a neighbour starts moving at about a quarter covered; nothing moves under a trembling hand; a reversal turns round with no jump; one landing; the gap stays under the hand while the band scrolls; no picture blinks at lift, during the drag, at the drop, or when the daemon's answer arrives.

## Leave alone

What Liam accepted as built: arrows and Tidy do nothing on a deck page; several frames dropped on a slide's middle join beside it (now: at the gap); a slide named in `deck.json` with no frame is skipped; the band's look; going into a slide; presenting (another ticket, #298, is changing Present: pull main often). The Pages rail's own row dragging. Everything outside the experiment `deck`.

## Done when

- The gap rule is proven as a function; the captured-frames suite covers the list above; today's deck suites pass, with the trade cases removed.
- **On the m1, in the Mac app built from your branch** (the `m1` skill, #283's harness): record at 60 fps a slow reorder, a fast one, a reversal, a tremble on a boundary, a loose frame in, a slide out, Esc mid-drag, and a drag across a 100-slide talk with the band scrolling. Go through the recordings frame by frame and say what you saw. It has to hold the display's frame rate while dragging on the 100-slide talk.
- `pnpm test:changed`, then the full `pnpm test`, `pnpm typecheck`, `pnpm check`. A changeset. Merged to main with CI green. Do not release.
- A message to task 557 with what was built, what differs from the design and why, and where the recordings are. Bring any choice this ticket does not settle to task 557 before building it. Put a time limit on every command that could wait for input (ssh to the m1, screen recording).

## Comments

### agent, 2026-11-11T22:11:53.557Z

#283 is merged (main `8a1522b8`). What it left for this ticket: the insert and trade zones (the preview along the band still changes per slide). What it gives you: the captured-frames test `src/daemon/deck-flicker-browser.test.ts` (samples every drawn frame through a drag, a drop and an undo), `FrameTween.keep` in `src/ui/deck/deck-motion.ts` (a glide holds its frames over a daemon read until the read has them where it is taking them: keep that guarantee when the tween becomes springs), and a recording harness that is not in the repo: `~/.brain-archive/deck-flicker/harness/` on devobee (`sweep.mjs <scenario>` runs one gesture and samples every drawn frame, headless or against the Mac app on the m1; `check.mjs`, `win.py`, `chart.mjs` analyse; `batch.sh`, `launch.sh`, `build-after.sh` are the m1 side; the m1 lane is `~/dev/scratch/flicker-598/`). Its README is `~/.brain-archive/deck-flicker/m1/README.md`. The m1's screen capture reaches only about 12 fps, so the frame-by-frame proof is the samples (120 a second), not the video.

### agent, 2026-11-12T03:02:03.746Z

Merged to main and judged in task 557.
