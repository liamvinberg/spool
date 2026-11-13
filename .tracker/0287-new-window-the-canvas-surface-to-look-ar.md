# #287 · New window: the canvas surface, to look around, behind `new-window`

- State: open
- Labels: ready-for-agent
- Parent: #284
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:03.529Z
- Updated: 2026-11-12T13:04:32.942Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The new window's first form: with the experiment `new-window` on, opening a project shows its canvas in a window written new, and a person can look around it. Nothing can be changed yet and no extension draws in it yet.

Read the spec's "The line" and "The new window". In short:

- **The experiment** `new-window`, off by default, and never switched on by a beta build: the experiments registry gains a way to mark an experiment so, because Spool Beta turns every experiment on and Liam works in it. Exactly: a beta build makes every experiment's default on (`experimentDefault` in `src/settings/experiments.ts` returns `betaBuild || stage === "beta"`), and a value set by hand wins over the default. The mark makes this one's default off in a beta build too, and `src/settings/registry.test.ts`, which expects every experiment on in a beta, is updated to say so.
- **The switch**: with it on, the project screen mounts the new window in place of today's. Home, tabs, the window's chrome, settings and the daemon are shared.
- **The surface**: the field of frames with their pictures, documents mounted and frozen by today's rules (the glossary's Caused mounting and Freeze), labels, placeholders, broken frames; the camera (pan, zoom, fly, fit); pages and going between them, with the path; selecting frames by click and by marquee; going into a frame and out; playing a frame. Every one of these draws a frame **where its motion has it**, not where it stands (#299): carry the reading side from today's window (`src/ui/canvas/frame-motion.ts`: `drawn(name)` and `listen`, read by the picture layer, the frame's slot, labels, broken frames and selection rings, with no React render per frame, and with a lifted frame's picture drawn last and never twice). Hit testing reads the drawn place as well, through one function, so that what a person sees is what they click (today it reads the standing place, which is the same thing while nothing moves; task 624's candidate draws a frame away from where it stands and needs this). Nothing moves frames yet, so core's motion answers "where it stands" for all of them; the editing ticket gives it a writer. Core's own sync notice comes too, with its offer to upgrade the format (`sync-state.tsx`).
- **Who gets the pointer, the wheel and each key** is one pure function with its tests (spec, same section), and building it is this ticket's job: task 590 closed without a pick and nothing of it landed. Shape: `routeInput(what happened, what is under it, the canvas's state, policy)` returns the owner (the canvas, a tool, a frame, a stage, a pane) and the next routing state. That state's shape belongs to the policy, and the surface keeps it without looking inside: today's holds the entered frame, and the candidate in task 624 ("forward": one to four frames brought to the middle of the window, held or staying) will hold which frames are forward. It reads no DOM and causes nothing: reading the event, focus, pointer capture and checking which frame sent a message stay in thin adapters around it. The policy is **today's rule**, written down from the code, and from the code where the glossary differs (`GLOSSARY.md` says a prototype's own Esc stays inside it; the code relays every Esc): entering by double-click or Enter, pointer and Tab only for an entered frame, the Esc ladder, the wheel's 150 ms latch that keeps a gesture with whoever it started on, held modifiers and their release on blur, typing and composition in a field, and a frame's chance to refuse ⌥-arrows before spool acts. The seventeen places this is decided today are listed with line numbers in `~/.brain-archive/core-spec/refresh/scout-input.md`. Task 624 will pick a new rule later, and it must be able to arrive as a second policy with no change to the surface. Tools, panes and stages come in later tickets and feed this same function, never a listener of their own.
- **It looks like today's window**: `app/spool-canvas` on the team canvas is the design. Where a pane, the toolbar or a tool will sit there is an empty frame for now.
- **Stores and actions** as the SDK will hand them out (the project, pages, frames with geometry, selection, the entered frame, the camera; select, go to a page, fly to, enter, leave), built now as the surface's own state so the window host can expose them unchanged.
- **Speed and motion** are part of this ticket, not a later pass: measure opening spool's own canvas, panning and zooming against today's window (`bench/` has the harnesses), and prove on captured frames that opening a page, pan, zoom, selecting and switching pages show no blank and no picture swapped back. Pin what is measured, for every later ticket: a frozen copy of spool's canvas (say its frame count in the handoff), and one meaning each for "first usable picture" (every frame in view shows a picture or its live document), frame times in a paced pan and zoom (`bench/canvas.ts`), memory (the window's processes, a minute after opening, hands off) and idle CPU (the half minute after that). `bench/` starts its own Chromium and daemons: give it a switch that runs the same trace against the new window.

## Decided

- Written in its own tree. Leaf modules of today's window that know no feature are imported as they are (the picture layer, the frame shell, labels, snapping, `frame-motion.ts`, `camera-store.ts` with its fix for a flight that arrives late); a module that mixes a feature in is written again without it. Two have taken the deck in since the spec was written. `camera.ts` imports the deck's layout for `fitBand`: split it where it stands (the deck's fit goes to `src/ui/deck/`, behaviour unchanged, today's suites untouched) so both windows share the camera maths. `canvas-store.ts` has gained `deckSlides`: the new tree's own state does not carry it (the page kind ticket, #317, brings the general form), and `selectionTargetsOf` in `lifecycle.ts` takes the settling as an argument, so it is shared as it is. `canvas-corner.tsx` is a composite of three features (the agent's path, the faces, Present) and is not imported; the row comes in the window host's ticket. `src/ui/canvas/canvas.tsx` is not edited; the edits outside the new tree are where the project screen is chosen, and that one split.
- The surface knows nothing of any feature: no flows, knobs, comments, presence, agent marks, deck. Those arrive through slots.

## Where to start

`src/ui/app.tsx` (where `ProjectCanvas` is mounted), `src/ui/experiments.ts` and `src/settings/experiments.ts` (and `src/channel.ts` for the beta default), `src/ui/canvas/` (`camera.ts`, `camera-store.ts`, `canvas-store.ts`, `frame-shell.tsx`, `frame-label.tsx`, the picture layer, `canvas-path.tsx`, `pages.ts`), `src/ui/hotkeys.ts` and `hotkey-dispatch.ts`, the frame shim's relay lists (`src/runtime/frame-shim/`). The first comment on ticket #251 is a map of what attaches to `canvas.tsx` and where. What changed in these files after the spec was written is in `~/.brain-archive/core-spec/refresh/scout-canvas.md`, commit by commit. `bench/canvas.ts`, `pan-trace.ts`, `arrival.ts`.

## Leave alone

Today's window and its tests. The daemon. Anything that changes the canvas (the next tickets).

## Done when

- With the experiment on, the suites of today's window that only look (opening, camera, selection, pages, entering, playing) pass against the new window by a switch in the test setup, with no change to what they assert. List them in the handoff: that list is the start of the parity list.
- A beta build does not switch the experiment on; a test proves it. Switched on by hand in Settings (Experimental, then Reload canvas) it opens the new window, and switched off it opens today's again, with the project's files byte for byte the same after both: this is how Liam tests the rebuild in Spool Beta from this ticket on.
- The numbers, old against new, on spool's own canvas are in the handoff, and new is not slower on any.
- The captured-frame test passes.
- With the experiment off nothing has changed: every existing suite passes untouched. `pnpm test:changed`, `pnpm typecheck`, `pnpm check`. No changeset: no release carries the experiment (spec, Further Notes).

## Comments

### agent, 2026-11-12T12:04:59.032Z

Task 624 reported its candidate ("forward", no pick yet, to be tried as an experiment in Spool Beta). Two seams made explicit so it can arrive without a rebuild: the routing state belongs to the policy, and hit testing reads the drawn place. Its scout notes: /tmp/pi-orch/play-624/scout.md on devobee.
