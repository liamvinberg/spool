# #144 · Move between frames while live

- State: closed
- Blocked by: #139
- Created: 2026-10-18T17:43:56.817Z
- Updated: 2026-10-18T17:44:01.777Z
- Closed: 2026-10-18T17:44:01.777Z

## Decided (task 145, after trying the mocks on explore/keyboard-nav)

Base is **walk-a** (design/frames/explore/keyboard-nav/walk-a, shared/ui/explore/keyboard-nav/walk/\*), plus a **⌥ overview** taken from **switcher-b** (frames/explore/keyboard-nav/switcher-b, shared/ui/explore/keyboard-nav/switcher-stage.tsx, shared/lib/explore/keyboard-nav/switcher-world.ts).

**Step and stay live**

- In an entered frame, ⌥ arrows and ⌥hjkl (matched by event.code KeyH/J/K/L: ⌥ changes the character) step to the neighbouring frame (#141's stepSpatially rules, step-back memory included) and land entered there. ⌘⌥ arrows always step, even from a text field.
- In a text field inside the frame (input, textarea, contenteditable focused), plain ⌥ keys belong to the field and nothing happens.
- A prototype that handles a key itself keeps it: spool acts only when the frame's own handlers did not preventDefault the event (shim listens so it sees defaultPrevented, e.g. bubble phase on window, or checks after dispatch). `spool check` (or the flows/check report agents read) warns when a frame's source reads altKey or handles Alt, so an agent knows the key is contested.
- Landing: walk-a's "live · esc exits" chip slides in from the side you came from, one ring flash on the frame.

**⌥ overview (switcher-b look, wider pull-back)**

- Holding ⌥ alone \~120ms with no other key (and not in a text field) eases the camera out (\~200ms) to fit the current frame plus its nearest neighbour in each direction. The first ⌥+arrow/hjkl opens it instantly.
- While held: target ring with its name and "let go of ⌥ to enter", each neighbour a thin ring with the key that reaches it on the edge facing the target, others dimmed; corners mark what the screen shows after letting go; pressing toward nothing bumps and says "nothing to the right".
- Arrows/hjkl move the target. Letting go of ⌥ flies in and enters the target. Letting go without moving zooms back in, still live in the same frame. Any other key while ⌥ is held cancels it (⌥2 types @ on Swedish layouts).
- Also works from the canvas with a frame selected and not entered (selects/enters the same way? letting go selects, ⏎ enters), unless that collides with existing ⌥ gestures (⌥ drag, ⌥ click a chevron): pointer down cancels the overview.

**Walk the threads**

- ⌘] / ⌘[ (#139 bracket keys by event.code; ⌘¨ / ⌘å on Swedish) walk along the flow map and back along the path actually taken, staying entered.
- At a branch, ⌘] takes the first thread; pressing ] again before releasing ⌘ swaps to the next branch, the chip says "1 of 2 · ] again for pick-a-plan".

**Click to switch**

- While entered, hovering another frame outlines it with the label "click enters"; one click enters it.

All keys are register entries in src/ui/hotkeys.ts (relay flags for the ones that leave a frame), told on the ? sheet.

*From Linear DEV-295.*

Related: #141

Plane: SPOOL-144
