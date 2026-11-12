# #287 · New window: the canvas surface, to look around, behind `new-window`

- State: open
- Labels: ready-for-agent
- Parent: #284
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:03.529Z
- Updated: 2026-11-11T10:15:03.529Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The new window's first form: with the experiment `new-window` on, opening a project shows its canvas in a window written new, and a person can look around it. Nothing can be changed yet and no extension draws in it yet.

Read the spec's "The line" and "The new window". In short:

- **The experiment** `new-window`, off by default, and never switched on by a beta build: the experiments registry gains a way to mark an experiment so, because Spool Beta turns every experiment on and Liam works in it.
- **The switch**: with it on, the project screen mounts the new window in place of today's. Home, tabs, the window's chrome, settings and the daemon are shared.
- **The surface**: the field of frames with their pictures, documents mounted and frozen by today's rules (the glossary's Caused mounting and Freeze), labels, placeholders, broken frames; the camera (pan, zoom, fly, fit); pages and going between them, with the path; selecting frames by click and by marquee; going into a frame and out; playing a frame.
- **Who gets the pointer, the wheel and each key** is one pure function with its tests (spec, same section). Task 590 is building that module on today's window; if it is on main, use it; if not, build the seam with today's entered-frame rule as its policy and say so.
- **It looks like today's window**: `app/spool-canvas` on the team canvas is the design. Where a pane, the toolbar or a tool will sit there is an empty frame for now.
- **Stores and actions** as the SDK will hand them out (the project, pages, frames with geometry, selection, the entered frame, the camera; select, go to a page, fly to, enter, leave), built now as the surface's own state so the window host can expose them unchanged.
- **Speed and motion** are part of this ticket, not a later pass: measure opening spool's own canvas, panning and zooming against today's window (`bench/` has the harnesses), and prove on captured frames that opening a page, pan, zoom, selecting and switching pages show no blank and no picture swapped back.

## Decided

- Written in its own tree. Leaf modules of today's window that know no feature are imported as they are (camera maths, the picture layer, the frame shell, snapping); a module that mixes a feature in is written again without it. `src/ui/canvas/canvas.tsx` is not edited; the one edit outside the new tree is where the project screen is chosen.
- The surface knows nothing of any feature: no flows, knobs, comments, presence, agent marks, deck. Those arrive through slots.

## Where to start

`src/ui/app.tsx` (where `ProjectCanvas` is mounted), `src/ui/experiments.ts` and `src/settings/experiments.ts` (and `src/channel.ts` for the beta default), `src/ui/canvas/` (`camera.ts`, `camera-store.ts`, `canvas-store.ts`, `frame-shell.tsx`, `frame-label.tsx`, the picture layer, `canvas-path.tsx`, `pages.ts`), `src/ui/hotkeys.ts` and `hotkey-dispatch.ts`, the frame shim's relay lists (`src/runtime/frame-shim/`). The first comment on ticket #251 is a map of what attaches to `canvas.tsx` and where. `bench/canvas.ts`, `pan-trace.ts`, `arrival.ts`.

## Leave alone

Today's window and its tests. The daemon. Anything that changes the canvas (the next tickets).

## Done when

- With the experiment on, the suites of today's window that only look (opening, camera, selection, pages, entering, playing) pass against the new window by a switch in the test setup, with no change to what they assert. List them in the handoff: that list is the start of the parity list.
- A beta build does not switch the experiment on; a test proves it.
- The numbers, old against new, on spool's own canvas are in the handoff, and new is not slower on any.
- The captured-frame test passes.
- With the experiment off nothing has changed: every existing suite passes untouched. `pnpm test:changed`, `pnpm typecheck`, `pnpm check`. A changeset for the experiment.
