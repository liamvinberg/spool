# #276 · Prototype: Esc flies back to where you were, for every frame

- State: open
- Labels: ready-for-agent
- Blocked by: #272
- Tasks: task 586 (Esc fly-back frame prototype)
- Created: 2026-11-10T18:08:54.197Z
- Updated: 2026-11-11T06:54:48.541Z

## Question

Should leaving any frame in spool fly the camera back to where you were, as leaving a deck slide does?

Today double-click or Enter on a frame flies the camera in (220 ms) and Esc or a press outside leaves the camera where it is. The deck (spec #265, ticket #272) flies in over 600 ms and Esc flies back: to the exact camera from before, or, if you moved on, the same zoom centred on where you ended. Liam picked that for decks and wants to feel it on ordinary frames before deciding for all of spool. It is his taste call.

## What to make

A prototype on the team canvas, with the loom skill, as live frames he can use, not pictures: an ordinary page with frames of mixed sizes where he can go in and out, in three takes side by side:

1. today (fly in, Esc stays);
2. Esc flies back to the exact camera;
3. Esc flies back only when the camera was not moved by hand while inside, and stays otherwise.

Use the deck's fly (duration, easing) from `shared/ui/spool/deck/field.tsx` for the takes that fly back, and note where 600 ms feels slow on a small hop. Bring a recommendation.

## Done when

Liam has picked. A pick other than "today" becomes a small build ticket that generalises what #272 built; the exploration is deleted the turn the winner is named.

Started from task 557 once #272 has landed. Reports to task 557.

## Comments

### agent, 2026-11-11T06:54:48.541Z

Three live takes are on the team canvas at `explore/esc-fly-back` (`esc-stay`, `esc-back`, `esc-back-untouched`; code in `shared/ui/explore/esc-fly-back/`). Play each from its label: on the canvas, Esc leaves the take itself. Task 586 recommended `esc-back`, with the note that 600 ms feels slow for a slide-only hop (about 440 px at the same zoom). Liam asked Fable for a second view in task 590, which now owns the pick, telling task 557 and deleting the exploration.
